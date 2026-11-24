import Foundation

/// A `matrix:` URI (Matrix spec, "Matrix URI scheme"), reduced to what the page needs. Identifiers
/// carry their sigil (`!room:server`, `#alias:server`, `@user:server`; event IDs `$…`). A port of
/// `desktop/src/matrixuri.*`; the rules are in `desktop/BRIDGE.md`.
public struct MatrixLink: Equatable {
    public enum Kind: String { case room, alias, user }
    public enum Action: String { case join, chat }

    public var kind: Kind
    public var id: String
    /// Room and alias only; empty when none.
    public var eventId: String = ""
    /// Server names, in order, without repeats.
    public var via: [String] = []
    public var action: Action?

    public init(kind: Kind, id: String, eventId: String = "", via: [String] = [], action: Action? = nil) {
        self.kind = kind
        self.id = id
        self.eventId = eventId
        self.via = via
        self.action = action
    }

    /// The payload of the `openLink` event: `{ kind, id, eventId?, via?, action? }`.
    public var json: JSONValue {
        var o: [String: JSONValue] = ["kind": .string(kind.rawValue), "id": .string(id)]
        if !eventId.isEmpty { o["eventId"] = .string(eventId) }
        if !via.isEmpty { o["via"] = .array(via.map { .string($0) }) }
        if let action { o["action"] = .string(action.rawValue) }
        return .object(o)
    }
}

public enum MatrixURI {
    /// Anything longer is refused, not cut.
    public static let maxLength = 2048
    public static let maxVia = 10

    public struct Failure: Error, CustomStringConvertible {
        public let description: String
        init(_ why: String) { description = why }
    }

    /// Strict: the shapes the spec defines and nothing else.
    ///   matrix:roomid/<id>[/e/<event>][?via=<server>&…][&action=join|chat]
    ///   matrix:r/<alias>[/e/<event>][?…]
    ///   matrix:u/<user>[?action=chat]
    public static func parse(_ uri: String) -> Result<MatrixLink, Failure> {
        func fail(_ why: String) -> Result<MatrixLink, Failure> { .failure(Failure(why)) }
        let scheme = "matrix:"
        if uri.utf16.count > maxLength { return fail("too long") }
        guard uri.utf16.count >= scheme.utf16.count,
              String(decoding: Array(uri.utf16.prefix(scheme.utf16.count)), as: UTF16.self).lowercased() == scheme
        else { return fail("not a matrix: URI") }
        let rest = String(decoding: Array(uri.utf16.dropFirst(scheme.utf16.count)), as: UTF16.self)
        if rest.contains("#") { return fail("a fragment has no meaning in a matrix: URI") }
        if rest.hasPrefix("/") { return fail("no authority or absolute path in a matrix: URI") }

        var path = Substring(rest)
        var query = Substring("")
        if let q = rest.firstIndex(of: "?") {
            path = rest[..<q]
            query = rest[rest.index(after: q)...]
        }
        if path.isEmpty { return fail("empty path") }

        var segments: [String] = []
        for part in path.split(separator: "/", omittingEmptySubsequences: false) {
            if part.isEmpty { return fail("empty path segment") }
            guard let decoded = decodeComponent(part) else { return fail("bad percent-encoding or characters in the path") }
            segments.append(decoded)
        }

        var link: MatrixLink
        switch segments[0] {
        case "roomid", "r":
            let kind: MatrixLink.Kind = segments[0] == "r" ? .alias : .room
            guard segments.count == 2 || segments.count == 4 else { return fail("a room link is <kind>/<id>[/e/<event>]") }
            link = MatrixLink(kind: kind, id: (kind == .room ? "!" : "#") + segments[1])
            guard kind == .room ? BridgeChecks.validRoomId(link.id) : validMxid(link.id, sigil: "#", alias: true) else {
                return fail("not a valid room ID or alias")
            }
            if segments.count == 4 {
                guard segments[2] == "e" else { return fail("only /e/<event> may follow a room") }
                link.eventId = "$" + segments[3]
                guard BridgeChecks.validEventId(link.eventId) else { return fail("not a valid event ID") }
            }
        case "u":
            guard segments.count == 2 else { return fail("a user link is u/<user>") }
            link = MatrixLink(kind: .user, id: "@" + segments[1])
            guard validMxid(link.id, sigil: "@", alias: false) else { return fail("not a valid user ID") }
        default:
            return fail("unknown kind")
        }

        var haveAction = false
        for param in query.split(separator: "&", omittingEmptySubsequences: true) {
            let eq = param.firstIndex(of: "=")
            let rawKey = eq.map { param[..<$0] } ?? param
            let rawValue = eq.map { param[param.index(after: $0)...] } ?? Substring("")
            guard let key = decodeComponent(rawKey) else { return fail("bad percent-encoding or characters in the query") }
            var value = ""
            if !rawValue.isEmpty {
                guard let v = decodeComponent(rawValue) else { return fail("bad percent-encoding or characters in the query") }
                value = v
            }
            switch key {
            case "via":
                guard validServerName(value) else { return fail("bad via server") }
                if !link.via.contains(value) {
                    if link.via.count >= maxVia { return fail("too many via servers") }
                    link.via.append(value)
                }
            case "action":
                if haveAction { return fail("action given twice") }
                haveAction = true
                guard let a = MatrixLink.Action(rawValue: value) else { return fail("unknown action") }
                link.action = a
            default:
                break // ignored, never forwarded
            }
        }
        if link.kind == .user, link.action == .join || !link.via.isEmpty {
            return fail("a user link takes only action=chat")
        }
        return .success(link)
    }

    /// Percent-decoding that refuses what it cannot make sense of: a stray `%`, raw characters
    /// outside printable ASCII, a result that is not UTF-8, or one with control, format (bidi
    /// overrides, zero-width joiners), separator, private-use or non-characters in it.
    static func decodeComponent(_ raw: Substring) -> String? {
        let units = Array(raw.utf16)
        var bytes: [UInt8] = []
        bytes.reserveCapacity(units.count)
        var i = 0
        func hex(_ u: UInt16) -> UInt8? {
            switch u {
            case 0x30 ... 0x39: return UInt8(u - 0x30)
            case 0x41 ... 0x46: return UInt8(u - 0x41 + 10)
            case 0x61 ... 0x66: return UInt8(u - 0x61 + 10)
            default: return nil
            }
        }
        while i < units.count {
            let c = units[i]
            if c == 0x25 /* % */ {
                guard i + 2 < units.count, let hi = hex(units[i + 1]), let lo = hex(units[i + 2]) else { return nil }
                bytes.append(hi << 4 | lo)
                i += 3
            } else if c > 0x20, c < 0x7F {
                bytes.append(UInt8(c))
                i += 1
            } else {
                return nil
            }
        }
        guard let s = String(validatingUTF8Bytes: bytes) else { return nil }
        for c in s.unicodeScalars {
            switch c.properties.generalCategory {
            case .control, .format, .surrogate, .privateUse, .lineSeparator, .paragraphSeparator, .spaceSeparator:
                return nil
            default:
                if c.properties.isNoncharacterCodePoint { return nil }
            }
        }
        return s
    }

    static func validLocalPart(_ local: Substring, alias: Bool) -> Bool {
        if local.isEmpty { return false }
        if !alias {
            return local.unicodeScalars.allSatisfy { BridgeChecks.isAlnum($0) || "._=-/+".unicodeScalars.contains($0) }
        }
        // An alias may be any printable text, bar the sigils and the separator.
        return local.unicodeScalars.allSatisfy { !$0.properties.isWhitespace && !"#@!$:".unicodeScalars.contains($0) }
    }

    /// `<sigil><local>:<server>`, at most 255 bytes, for aliases and users.
    static func validMxid(_ id: String, sigil: Character, alias: Bool) -> Bool {
        guard id.utf16.count >= 4, id.first == sigil, id.utf8.count <= 255,
              let colon = id.firstIndex(of: ":") else { return false }
        let local = id[id.index(after: id.startIndex) ..< colon]
        guard !local.isEmpty else { return false }
        return validLocalPart(local, alias: alias) && validServerName(String(id[id.index(after: colon)...]))
    }

    /// A server name: a DNS name or a bracketed IPv6 literal, with an optional port up to 65535.
    public static func validServerName(_ name: String) -> Bool {
        guard name.utf16.count <= 255, !name.isEmpty else { return false }
        var host = Substring(name)
        var port: Substring?
        if name.hasPrefix("[") {
            guard let close = name.firstIndex(of: "]") else { return false }
            let inner = name[name.index(after: name.startIndex) ..< close]
            guard (2 ... 45).contains(inner.unicodeScalars.count),
                  inner.unicodeScalars.allSatisfy({ BridgeChecks.isDigit($0) || ("a" ... "f").contains($0) || ("A" ... "F").contains($0) || $0 == ":" || $0 == "." })
            else { return false }
            let after = name[name.index(after: close)...]
            if !after.isEmpty {
                guard after.first == ":" else { return false }
                port = after.dropFirst()
            }
        } else {
            if let colon = name.firstIndex(of: ":") {
                host = name[..<colon]
                port = name[name.index(after: colon)...]
            }
            guard let first = host.unicodeScalars.first, BridgeChecks.isAlnum(first),
                  host.unicodeScalars.allSatisfy({ BridgeChecks.isAlnum($0) || $0 == "." || $0 == "-" }) else { return false }
        }
        if let port {
            guard (1 ... 5).contains(port.unicodeScalars.count), port.unicodeScalars.allSatisfy(BridgeChecks.isDigit),
                  let n = Int(port), n <= 65535 else { return false }
        }
        return true
    }
}

extension String {
    /// Nil unless the bytes are valid UTF-8.
    init?(validatingUTF8Bytes bytes: [UInt8]) {
        // Decoding replaces anything invalid (overlong forms, surrogates, stray bytes) with U+FFFD,
        // so the bytes only come back unchanged when they were valid.
        let s = String(decoding: bytes, as: UTF8.self)
        guard Array(s.utf8) == bytes else { return nil }
        self = s
    }
}
