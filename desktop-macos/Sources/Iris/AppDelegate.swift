import AppKit
import IrisShellCore
import WebKit

/// The app: one window, the bridge wired to the Dock badge, notifications, the system appearance and
/// `matrix:` links. Closing the window keeps Iris running (and syncing) in the Dock, as closing to the
/// tray does on Linux; Quit (⌘Q) ends it.
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private var window: NSWindow!
    private var web: WebController!
    private let bridge = Bridge(version: Shell.version)
    private let notifier = Notifier()
    private var appearanceObservation: NSKeyValueObservation?
    /// Links that arrived before the window existed (a cold start from a link).
    private var earlyLinks: [URL] = []
    private var launched = false

    func applicationWillFinishLaunching(_ notification: Notification) {
        // Before launching finishes, so the click or the link that launched Iris is not missed.
        notifier.start()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard let policy = NavigationPolicy(origin: Shell.origin) else {
            fatalError("Not an origin: \(Shell.origin)")
        }
        Log.info("Iris \(Shell.version) on macOS \(ProcessInfo.processInfo.operatingSystemVersionString), \(Shell.startURL.absoluteString)\(Shell.testHooks ? " (test build)" : "")")
        if quitIfAlreadyRunning() { return }
        buildMenu()

        bridge.onUnreadChanged = { unread in
            let label = unread.total > 0 ? String(unread.total) : nil
            NSApp.dockTile.badgeLabel = label
            Log.state("badge=\(label ?? "none") highlight=\(unread.highlight)")
        }
        bridge.onNotify = { [notifier] in notifier.notify($0) }
        bridge.onCloseNotifications = { [notifier] in notifier.closeRoom($0) }
        notifier.onOpenRoom = { [weak self] roomId, eventId in
            self?.showWindow()
            self?.bridge.openRoom(roomId: roomId, eventId: eventId)
        }
        notifier.onReply = { [weak self] roomId, eventId, text in
            self?.bridge.reply(roomId: roomId, eventId: eventId, text: text)
        }

        web = WebController(bridge: bridge, policy: policy)
        bridge.onEvent = { [weak self] name, payload in self?.web.emit(name, payload) }

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1100, height: 760),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = Shell.displayName
        window.minSize = NSSize(width: 360, height: 400)
        window.contentViewController = web
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.tabbingMode = .disallowed
        window.center()
        window.setFrameAutosaveName("IrisMainWindow")
        // The page's title, as on Linux; Iris until the page has one.
        web.webView.addObserver(self, forKeyPath: #keyPath(WKWebView.title), options: [.new], context: nil)

        // colorScheme follows the system appearance.
        appearanceObservation = NSApp.observe(\.effectiveAppearance, options: [.initial, .new]) { [weak self] app, _ in
            self?.appearanceChanged(app.effectiveAppearance)
        }

        web.start()
        launched = true
        let links = earlyLinks
        earlyLinks = []
        openLinks(links)
        showWindow()
    }

    override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey: Any]?, context: UnsafeMutableRawPointer?) {
        let title = web.webView.title ?? ""
        window.title = title.isEmpty ? Shell.displayName : title
    }

    private var lastDark: Bool?
    private func appearanceChanged(_ appearance: NSAppearance) {
        var dark = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
        #if IRIS_SHELL_TEST_HOOKS
        if let forced = Shell.env("IRIS_SHELL_COLOR_SCHEME") { dark = forced == "dark" }
        #endif
        guard dark != lastDark else { return }
        lastDark = dark
        Log.state("color-scheme dark=\(dark)")
        bridge.setColorScheme(dark: dark)
    }

    /// One Iris: a second copy (`open -n`) hands over to the first and quits.
    private func quitIfAlreadyRunning() -> Bool {
        let me = ProcessInfo.processInfo.processIdentifier
        guard let other = NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier ?? Shell.bundleId)
            .first(where: { $0.processIdentifier != me }) else { return false }
        Log.state("already-running pid=\(other.processIdentifier)")
        if #available(macOS 14, *) { other.activate() } else { other.activate(options: .activateIgnoringOtherApps) }
        NSApp.terminate(nil)
        return true
    }

    func showWindow() {
        guard let window else { return }
        if window.isMiniaturized { window.deminiaturize(nil) }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: matrix: links (CFBundleURLTypes), at launch or while running

    func application(_ application: NSApplication, open urls: [URL]) {
        if !launched {
            earlyLinks.append(contentsOf: urls)
            return
        }
        openLinks(urls)
    }

    private func openLinks(_ urls: [URL]) {
        var opened = 0
        for url in urls.prefix(4) {
            switch MatrixURI.parse(url.absoluteString) {
            case let .success(link):
                bridge.openLink(link)
                opened += 1
            case let .failure(why):
                Log.info("Dropped matrix: link - \(why)")
            }
        }
        if urls.count > 4 { Log.info("Dropped \(urls.count - 4) matrix: links (too many at once)") }
        if opened > 0 {
            Log.state("links-opened=\(opened)")
            showWindow()
        }
    }

    // MARK: window and app life

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        // Closing hides: Iris keeps syncing, and the Dock icon brings it back.
        sender.orderOut(nil)
        Log.state("window-hidden")
        return false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWindow()
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationWillTerminate(_ notification: Notification) {
        notifier.closeAll()
        NSApp.dockTile.badgeLabel = nil
    }

    // MARK: menu

    @objc private func reload(_ sender: Any?) { web.reload() }
    @objc private func closeWindow(_ sender: Any?) { if let w = NSApp.keyWindow { _ = windowShouldClose(w) } }
    @objc private func showMainWindow(_ sender: Any?) { showWindow() }

    private func buildMenu() {
        let main = NSMenu()
        func submenu(_ title: String, _ items: [NSMenuItem]) {
            let item = NSMenuItem()
            let menu = NSMenu(title: title)
            items.forEach(menu.addItem)
            item.submenu = menu
            main.addItem(item)
        }
        func item(_ title: String, _ action: Selector?, _ key: String = "", _ mods: NSEvent.ModifierFlags = .command, target: AnyObject? = nil) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
            i.keyEquivalentModifierMask = mods
            i.target = target
            return i
        }
        let name = Shell.displayName
        submenu(name, [
            item("About \(name)", #selector(NSApplication.orderFrontStandardAboutPanel(_:))),
            .separator(),
            item("Hide \(name)", #selector(NSApplication.hide(_:)), "h"),
            item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
            item("Show All", #selector(NSApplication.unhideAllApplications(_:))),
            .separator(),
            item("Quit \(name)", #selector(NSApplication.terminate(_:)), "q"),
        ])
        submenu("File", [item("Close Window", #selector(closeWindow(_:)), "w", target: self)])
        // Copy and paste reach the web view only through an Edit menu.
        submenu("Edit", [
            item("Undo", Selector(("undo:")), "z"),
            item("Redo", Selector(("redo:")), "z", [.command, .shift]),
            .separator(),
            item("Cut", #selector(NSText.cut(_:)), "x"),
            item("Copy", #selector(NSText.copy(_:)), "c"),
            item("Paste", #selector(NSText.paste(_:)), "v"),
            item("Paste and Match Style", #selector(NSTextView.pasteAsPlainText(_:)), "v", [.command, .option, .shift]),
            item("Select All", #selector(NSText.selectAll(_:)), "a"),
        ])
        submenu("View", [
            item("Reload", #selector(reload(_:)), "r", target: self),
            .separator(),
            item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]),
        ])
        let windowMenu: [NSMenuItem] = [
            item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"),
            item("Zoom", #selector(NSWindow.performZoom(_:))),
            .separator(),
            item(name, #selector(showMainWindow(_:)), "0", target: self),
        ]
        submenu("Window", windowMenu)
        NSApp.mainMenu = main
        NSApp.windowsMenu = main.items.last?.submenu
    }
}
