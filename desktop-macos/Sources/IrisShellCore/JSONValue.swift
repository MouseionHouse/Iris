import Foundation

/// A JSON value as the page sent it. The adapter sends each call's arguments as one
/// `JSON.stringify`d string, so the shell sees exactly JSON's types: a boolean is never a number,
/// and nothing the page sends turns into an object of the shell's.
public enum JSONValue: Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    /// Parses JSON text. Nil when it is not JSON, or when a string in it holds a lone surrogate
    /// (`JSON.stringify` writes one as `\udXXX`; Swift would turn it into U+FFFD, which the Linux
    /// shell refuses rather than repairs).
    public static func parse(_ text: String) -> JSONValue? {
        guard !hasLoneSurrogateEscape(text), let data = text.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(JSONValue.self, from: data)
    }

    /// Compact JSON text, with keys sorted (so the output is stable for tests).
    public var serialized: String {
        switch self {
        case .null: return "null"
        case let .bool(b): return b ? "true" : "false"
        case let .number(n):
            if n.isFinite, n == n.rounded(), abs(n) < 1e15 { return String(Int64(n)) }
            return n.isFinite ? String(n) : "null"
        case let .string(s): return JSONValue.quote(s)
        case let .array(items): return "[" + items.map(\.serialized).joined(separator: ",") + "]"
        case let .object(fields):
            return "{" + fields.keys.sorted().map { JSONValue.quote($0) + ":" + fields[$0]!.serialized }.joined(separator: ",") + "}"
        }
    }

    static func quote(_ s: String) -> String {
        var out = "\""
        for unit in s.unicodeScalars {
            switch unit {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            case "\u{2028}": out += "\\u2028"
            case "\u{2029}": out += "\\u2029"
            default:
                if unit.value < 0x20 {
                    out += String(format: "\\u%04x", unit.value)
                } else {
                    out.unicodeScalars.append(unit)
                }
            }
        }
        return out + "\""
    }

    /// True when a `\uXXXX` escape in the text is a surrogate that is not half of a pair.
    static func hasLoneSurrogateEscape(_ text: String) -> Bool {
        let units = Array(text.utf16)
        var i = 0
        var pendingHigh = false
        func hex(_ at: Int) -> UInt16? {
            guard at + 4 <= units.count else { return nil }
            var v: UInt16 = 0
            for u in units[at ..< at + 4] {
                let d: UInt16
                switch u {
                case 0x30 ... 0x39: d = u - 0x30
                case 0x41 ... 0x46: d = u - 0x41 + 10
                case 0x61 ... 0x66: d = u - 0x61 + 10
                default: return nil
                }
                v = v << 4 | d
            }
            return v
        }
        while i < units.count {
            if units[i] == 0x5C /* \ */, i + 1 < units.count {
                if units[i + 1] == 0x75 /* u */, let v = hex(i + 2) {
                    switch v {
                    case 0xD800 ... 0xDBFF:
                        if pendingHigh { return true }
                        pendingHigh = true
                    case 0xDC00 ... 0xDFFF:
                        if !pendingHigh { return true }
                        pendingHigh = false
                    default:
                        if pendingHigh { return true }
                    }
                    i += 6
                    continue
                }
                if pendingHigh { return true }
                i += 2
                continue
            }
            if pendingHigh { return true }
            i += 1
        }
        return pendingHigh
    }
}

extension JSONValue: Decodable {
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let n = try? c.decode(Double.self) {
            self = .number(n)
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let a = try? c.decode([JSONValue].self) {
            self = .array(a)
        } else {
            self = .object(try c.decode([String: JSONValue].self))
        }
    }
}
