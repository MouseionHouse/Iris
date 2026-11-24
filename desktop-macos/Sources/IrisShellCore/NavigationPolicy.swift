import Foundation

/// Which URLs the view may show, and which may be handed to the default browser. A port of
/// `desktop/src/navigationpolicy.*`.
public struct NavigationPolicy {
    public let origin: String
    let scheme: String
    let host: String
    let port: Int

    /// `origin` is `scheme://host[:port]`, as `IrisURL.origin` gives it.
    public init?(origin: String) {
        guard let url = URL(string: origin), let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased(), !host.isEmpty,
              let port = NavigationPolicy.effectivePort(scheme: scheme, port: url.port) else { return nil }
        self.origin = origin
        self.scheme = scheme
        self.host = host
        self.port = port
    }

    static func effectivePort(scheme: String, port: Int?) -> Int? {
        if let port { return port }
        switch scheme {
        case "https": return 443
        case "http": return 80
        default: return nil
        }
    }

    /// Same scheme, host and port as the allowed origin. Nothing else counts: not http:, not a
    /// subdomain, not a host that merely starts with the allowed one, not one with a userinfo.
    public func isAllowed(_ url: URL) -> Bool {
        guard let s = url.scheme?.lowercased(), let h = url.host?.lowercased(), !h.isEmpty,
              url.user == nil, url.password == nil else { return false }
        return s == scheme && h == host && NavigationPolicy.effectivePort(scheme: s, port: url.port) == port
    }

    /// The same rule for a security origin (a frame's, as WebKit reports it; port 0 is the default).
    public func isAllowedOrigin(scheme s: String, host h: String, port p: Int) -> Bool {
        let s = s.lowercased()
        return s == scheme && h.lowercased() == host && NavigationPolicy.effectivePort(scheme: s, port: p == 0 ? nil : p) == port
    }

    /// The bridge (`irisDesktop`) is offered on the allowed origin and nowhere else.
    public func bridgeOffered(_ url: URL) -> Bool { isAllowed(url) }

    /// Only web and mail links go to the default browser: a page cannot make the shell launch other
    /// handlers (file:, custom schemes).
    public static func mayOpenExternally(_ url: URL) -> Bool {
        guard let s = url.scheme?.lowercased() else { return false }
        return ["http", "https", "mailto"].contains(s)
    }
}

/// The URL the shell opens, from the build (`IRIS_URL`): `https://host[:port]`, an optional
/// trailing slash, nothing else. The same rule as the Linux shell's CMake check.
public struct IrisURL {
    public let url: URL
    /// `https://host[:port]`, no trailing slash.
    public let origin: String

    public init?(_ text: String) {
        var s = Substring(text)
        guard s.hasPrefix("https://") else { return nil }
        if s.hasSuffix("/") { s = s.dropLast() }
        let authority = s.dropFirst("https://".count)
        let parts = authority.split(separator: ":", omittingEmptySubsequences: false)
        guard (1 ... 2).contains(parts.count), !parts[0].isEmpty,
              parts[0].unicodeScalars.allSatisfy({ BridgeChecks.isAlnum($0) || $0 == "." || $0 == "-" }) else { return nil }
        if parts.count == 2 {
            guard (1 ... 5).contains(parts[1].count), parts[1].unicodeScalars.allSatisfy(BridgeChecks.isDigit) else { return nil }
        }
        guard let url = URL(string: String(s) + "/") else { return nil }
        self.url = url
        origin = String(s)
    }
}
