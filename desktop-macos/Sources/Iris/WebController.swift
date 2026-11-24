import AppKit
import IrisShellCore
import Network
import WebKit

/// The window's content: one WKWebView on the Iris web app with a persistent data store, the
/// `irisDesktop` bridge on the Iris origin only, other origins in the default browser, camera,
/// microphone and screen refused, downloads to ~/Downloads, and an offline page with Retry.
final class WebController: NSViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply, WKDownloadDelegate {
    static let messageHandlerName = "irisDesktop"

    let bridge: Bridge
    let policy: NavigationPolicy
    private(set) var webView: WKWebView!
    private let offlineView = OfflineView()
    private var retryTimer: Timer?
    private let pathMonitor = NWPathMonitor()
    private var offline = false {
        didSet {
            guard offline != oldValue else { return }
            offlineView.isHidden = !offline
            Log.state("offline=\(offline)")
            retryTimer?.invalidate()
            retryTimer = nil
            if offline {
                retryTimer = Timer.scheduledTimer(withTimeInterval: Shell.retryInterval, repeats: true) { [weak self] _ in self?.retry() }
            }
        }
    }

    init(bridge: Bridge, policy: NavigationPolicy) {
        self.bridge = bridge
        self.policy = policy
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    override func loadView() {
        let config = WKWebViewConfiguration()
        // Persistent: login, localStorage, IndexedDB and the service worker survive restarts
        // (~/Library/WebKit/house.mouseion.iris).
        config.websiteDataStore = .default()
        config.preferences.isElementFullscreenEnabled = true
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        let ucc = WKUserContentController()
        ucc.addScriptMessageHandler(self, contentWorld: .page, name: WebController.messageHandlerName)
        ucc.addUserScript(WKUserScript(source: injectedScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page))
        config.userContentController = ucc

        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1100, height: 760), configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        if #available(macOS 13.3, *) {
            // Safari → Develop → <this Mac> → Iris, for diagnosing the page.
            webView.isInspectable = true
        }
        webView.autoresizingMask = [.width, .height]

        let container = NSView(frame: webView.frame)
        container.addSubview(webView)
        offlineView.frame = container.bounds
        offlineView.autoresizingMask = [.width, .height]
        offlineView.isHidden = true
        offlineView.onRetry = { [weak self] in self?.retry() }
        container.addSubview(offlineView)
        view = container

        pathMonitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            DispatchQueue.main.async {
                if self?.offline == true { self?.retry() }
            }
        }
        pathMonitor.start(queue: .global(qos: .utility))
    }

    func start() {
        webView.load(URLRequest(url: Shell.startURL))
    }

    func reload() {
        if offline || webView.url == nil { retry() } else { webView.reload() }
    }

    private func retry() {
        if webView.url == nil || !(webView.url.map(policy.isAllowed) ?? false) {
            webView.load(URLRequest(url: Shell.startURL))
        } else {
            webView.reload()
        }
    }

    /// The adapter, wrapped so that it does nothing off the allowed origin.
    private func injectedScript() -> String {
        guard let url = Bundle.main.url(forResource: "bridge-adapter", withExtension: "js"),
              let adapter = try? String(contentsOf: url, encoding: .utf8) else {
            Log.error("bridge-adapter.js is missing from the bundle")
            return ""
        }
        let origin = JSONValue.array([.string(policy.origin)]).serialized
        return "(function () {\nif (location.origin !== \(origin)[0]) return;\n\(adapter)\n})();"
    }

    // MARK: native -> web

    /// Delivers an event to the page's handlers, only if the page is on the allowed origin (checked
    /// here and again in the page, in case it navigated in between).
    func emit(_ name: String, _ payload: String) {
        guard let webView, let url = webView.url, policy.bridgeOffered(url) else { return }
        webView.callAsyncJavaScript(
            "if (location.origin === origin && typeof window.__irisDesktopEvent === 'function') window.__irisDesktopEvent(name, payload);",
            arguments: ["origin": policy.origin, "name": name, "payload": payload], in: nil, in: .page
        ) { result in
            if case let .failure(error) = result { Log.error("Event \(name) not delivered: \(error.localizedDescription)") }
        }
    }

    // MARK: web -> native

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        let origin = message.frameInfo.securityOrigin
        // The bridge is offered on the allowed origin, in the main frame, and nowhere else.
        guard message.frameInfo.isMainFrame,
              policy.isAllowedOrigin(scheme: origin.protocol, host: origin.host, port: origin.port),
              let url = message.webView?.url, policy.bridgeOffered(url) else {
            Log.info("Refused a bridge call from \(origin.protocol)://\(origin.host)")
            replyHandler(nil, "irisDesktop is not available")
            return
        }
        guard let body = message.body as? [String: Any], let method = body["method"] as? String, let args = body["args"] as? String else {
            replyHandler(nil, "irisDesktop: malformed call")
            return
        }
        switch bridge.call(method, arguments: args) {
        case let .success(.string(s)): replyHandler(s, nil)
        case let .success(.bool(b)): replyHandler(b, nil)
        case let .success(.strings(list)): replyHandler(list, nil)
        case let .failure(error): replyHandler(nil, "irisDesktop: \(error)")
        }
        if Shell.testHooks, method != "latestEvents", method != "takePendingLinks" {
            Log.state("bridge-call \(method)")
        }
    }

    // MARK: navigation

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        // A new window (target=_blank, window.open) goes through createWebViewWith; frames inside
        // the page load what the page asks for, as in a browser.
        guard let frame = action.targetFrame, frame.isMainFrame else { return decisionHandler(.allow) }
        if policy.isAllowed(url) {
            decisionHandler(.allow)
            return
        }
        decisionHandler(.cancel)
        if Opener.open(url) { Log.state("opened-externally") }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if !response.canShowMIMEType {
            decisionHandler(.download)
            return
        }
        if response.isForMainFrame, let http = response.response as? HTTPURLResponse,
           let disposition = http.value(forHTTPHeaderField: "Content-Disposition"), disposition.lowercased().hasPrefix("attachment") {
            decisionHandler(.download)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        bridge.pageLoading()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        offline = false
        if let url = webView.url, policy.bridgeOffered(url) {
            bridge.pageConnected()
            Log.state("page-loaded")
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        failed(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        failed(error)
    }

    private func failed(_ error: Error) {
        let e = error as NSError
        // A navigation we cancelled or turned into a download, or one replaced by the next: not a failure.
        if e.domain == NSURLErrorDomain, e.code == NSURLErrorCancelled { return }
        if e.domain == "WebKitErrorDomain", e.code == 102 /* frame load interrupted */ { return }
        Log.info("Load failed: \(e.domain) \(e.code)")
        offlineView.setDetail(e.localizedDescription)
        offline = true
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        Log.error("The web content process ended; reloading")
        retry()
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    // MARK: downloads, to ~/Downloads

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        // Only the last path component, and never a hidden file.
        var name = (suggestedFilename as NSString).lastPathComponent.trimmingCharacters(in: .whitespaces)
        while name.hasPrefix(".") { name.removeFirst() }
        if name.isEmpty { name = "download" }
        let base = (name as NSString).deletingPathExtension
        let ext = (name as NSString).pathExtension
        var url = dir.appendingPathComponent(name)
        var n = 2
        while FileManager.default.fileExists(atPath: url.path) {
            url = dir.appendingPathComponent(ext.isEmpty ? "\(base) \(n)" : "\(base) \(n).\(ext)")
            n += 1
        }
        completionHandler(url)
    }

    func downloadDidFinish(_ download: WKDownload) {
        Log.state("download-finished")
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        Log.error("Download failed: \(error.localizedDescription)")
    }

    // MARK: UI: new windows to the browser; panels; no camera, microphone or screen

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, Opener.open(url) { Log.state("opened-externally") }
        return nil
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        // Desktop calls stay off (John's decision, as on Linux).
        Log.state("media-capture-refused type=\(type.rawValue)")
        decisionHandler(.deny)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        present(alert) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        present(alert) { completionHandler($0 == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = prompt
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        field.stringValue = defaultText ?? ""
        alert.accessoryView = field
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        present(alert) { completionHandler($0 == .alertFirstButtonReturn ? field.stringValue : nil) }
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        if let window = view.window {
            panel.beginSheetModal(for: window) { completionHandler($0 == .OK ? panel.urls : nil) }
        } else {
            completionHandler(panel.runModal() == .OK ? panel.urls : nil)
        }
    }

    private func present(_ alert: NSAlert, _ done: @escaping (NSApplication.ModalResponse) -> Void) {
        if let window = view.window, window.isVisible {
            alert.beginSheetModal(for: window, completionHandler: done)
        } else {
            done(alert.runModal())
        }
    }
}
