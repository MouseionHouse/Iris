import AppKit
import IrisShellCore
import os

/// The one place that names Iris. The URL comes from the build (Info.plist `IrisURL`, from
/// `IRIS_URL`); test builds may point the shell elsewhere with environment variables.
enum Shell {
    static let bundleId = "house.mouseion.iris"
    static let displayName = "Iris"

    static let version: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"

    /// The URL the shell opens and the origin it trusts.
    static let startURL: URL = {
        #if IRIS_SHELL_TEST_HOOKS
        if let s = env("IRIS_SHELL_START_URL"), let u = URL(string: s) { return u }
        #endif
        return irisURL.url
    }()

    static let origin: String = {
        #if IRIS_SHELL_TEST_HOOKS
        if let s = env("IRIS_SHELL_ALLOWED_ORIGIN") { return s }
        #endif
        return irisURL.origin
    }()

    private static let irisURL: IrisURL = {
        let raw = Bundle.main.object(forInfoDictionaryKey: "IrisURL") as? String ?? ""
        guard let u = IrisURL(raw) else {
            // build.sh refuses to build without it; a hand-made bundle can still get here.
            fatalError("Info.plist IrisURL is \"\(raw)\": it must be https://host or https://host:port")
        }
        return u
    }()

    /// How often the offline page tries again by itself.
    static let retryInterval: TimeInterval = {
        #if IRIS_SHELL_TEST_HOOKS
        if let s = env("IRIS_SHELL_RETRY_MS"), let ms = Double(s) { return ms / 1000 }
        #endif
        return 15
    }()

    static func env(_ name: String) -> String? {
        let v = ProcessInfo.processInfo.environment[name]
        return v?.isEmpty == false ? v : nil
    }

    static let testHooks: Bool = {
        #if IRIS_SHELL_TEST_HOOKS
        return true
        #else
        return false
        #endif
    }()
}

/// The unified log (subsystem house.mouseion.iris), and in test builds a file of `IRIS_STATE` lines
/// a test can wait for (`IRIS_SHELL_STATE_LOG`). Nothing a message says is logged.
enum Log {
    static let logger = Logger(subsystem: Shell.bundleId, category: "shell")

    static func info(_ message: String) {
        logger.notice("\(message, privacy: .public)")
    }

    static func error(_ message: String) {
        logger.error("\(message, privacy: .public)")
    }

    /// A state change a test can watch for; in a release build, a plain log line.
    static func state(_ message: String) {
        logger.notice("IRIS_STATE \(message, privacy: .public)")
        #if IRIS_SHELL_TEST_HOOKS
        if let path = Shell.env("IRIS_SHELL_STATE_LOG") {
            let line = Data("IRIS_STATE \(message)\n".utf8)
            if let h = FileHandle(forWritingAtPath: path) {
                h.seekToEndOfFile()
                h.write(line)
                try? h.close()
            } else {
                FileManager.default.createFile(atPath: path, contents: line)
            }
        }
        #endif
    }
}

/// Hands URLs to the default browser. Only web and mail links go out.
enum Opener {
    @discardableResult
    static func open(_ url: URL) -> Bool {
        guard NavigationPolicy.mayOpenExternally(url) else {
            Log.info("Not opened (not a web or mail link): scheme \(url.scheme ?? "none")")
            return false
        }
        #if IRIS_SHELL_TEST_HOOKS
        if let path = Shell.env("IRIS_SHELL_OPEN_LOG") {
            let line = Data((url.absoluteString + "\n").utf8)
            if let h = FileHandle(forWritingAtPath: path) {
                h.seekToEndOfFile()
                h.write(line)
                try? h.close()
            } else {
                FileManager.default.createFile(atPath: path, contents: line)
            }
            return true
        }
        #endif
        return NSWorkspace.shared.open(url)
    }
}
