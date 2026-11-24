import Foundation

/// The counts behind the Dock badge.
public struct Unread: Equatable {
    public var total: Int
    public var highlight: Int
    public init(total: Int, highlight: Int) {
        self.total = total
        self.highlight = highlight
    }
}

/// A notification icon as the page sent it: checked to be a small PNG or JPEG, not yet decoded.
public struct NotificationIcon: Equatable {
    public enum Format: String { case png, jpeg }
    public var format: Format
    public var data: Data
    public var width: Int
    public var height: Int
}

/// One notification as the page asked for it, every field checked.
public struct NotifyRequest: Equatable {
    public var id: String
    public var roomId: String
    /// Empty: not about one event.
    public var eventId: String
    public var title: String
    /// Plain text.
    public var body: String
    /// Nil: the app icon.
    public var icon: NotificationIcon?
    public var canReply: Bool

    public init(id: String, roomId: String, eventId: String = "", title: String, body: String, icon: NotificationIcon? = nil, canReply: Bool = true) {
        self.id = id
        self.roomId = roomId
        self.eventId = eventId
        self.title = title
        self.body = body
        self.icon = icon
        self.canReply = canReply
    }
}

/// The checks `window.irisDesktop` applies to what the page sends: the same limits as the Linux
/// shell (`desktop/src/irisbridge.cpp`), written down in `desktop/BRIDGE.md`. Arguments come from a
/// page the shell does not control, so anything off is refused, never repaired or clamped.
public enum BridgeChecks {
    /// Upper bound for an unread count.
    public static let maxUnread = 1_000_000
    // Lengths are in UTF-16 units (JavaScript's `length`), sizes in bytes.
    public static let maxIdLength = 255
    public static let maxTitleLength = 200
    public static let maxBodyLength = 2000
    /// What a reply typed in a notification can carry to the page; longer is cut.
    public static let maxReplyLength = 16000
    public static let maxIconBytes = 256 * 1024
    public static let maxIconPixels = 1024

    /// `{ total, highlight }`: whole numbers, 0 <= highlight <= total <= maxUnread, nothing else.
    public static func unread(_ args: JSONValue) -> Unread? {
        guard case let .object(o) = args, o.count == 2,
              let total = wholeNumber(o["total"], max: maxUnread),
              let highlight = wholeNumber(o["highlight"], max: maxUnread),
              highlight <= total else { return nil }
        return Unread(total: total, highlight: highlight)
    }

    /// `{ id, roomId, eventId?, title, body, icon?, canReply? }`.
    public static func notification(_ args: JSONValue) -> NotifyRequest? {
        guard case let .object(o) = args else { return nil }
        let allowed: Set<String> = ["id", "roomId", "eventId", "title", "body", "icon", "canReply"]
        guard o.keys.allSatisfy(allowed.contains),
              let id = plainText(o["id"], min: 1, max: maxIdLength, newlines: false),
              let roomId = plainText(o["roomId"], min: 1, max: maxIdLength, newlines: false), validRoomId(roomId),
              let title = plainText(o["title"], min: 1, max: maxTitleLength, newlines: false),
              let body = plainText(o["body"], min: 0, max: maxBodyLength, newlines: true) else { return nil }
        var r = NotifyRequest(id: id, roomId: roomId, title: title, body: body)
        if let e = o["eventId"] {
            guard let eventId = plainText(e, min: 1, max: maxIdLength, newlines: false), validEventId(eventId) else { return nil }
            r.eventId = eventId
        }
        if let i = o["icon"] {
            guard let icon = icon(fromDataURL: i) else { return nil }
            r.icon = icon
        }
        if let c = o["canReply"] {
            guard case let .bool(b) = c else { return nil }
            r.canReply = b
        }
        return r
    }

    /// `{ roomId }`.
    public static func closeTarget(_ args: JSONValue) -> String? {
        guard case let .object(o) = args, o.count == 1,
              let roomId = plainText(o["roomId"], min: 1, max: maxIdLength, newlines: false), validRoomId(roomId) else { return nil }
        return roomId
    }

    /// A reply typed in a notification, cut to what the page takes.
    public static func cutReply(_ text: String) -> String {
        let units = Array(text.utf16)
        guard units.count > maxReplyLength else { return text }
        var end = maxReplyLength
        // Do not cut a surrogate pair in half.
        if UTF16.isLeadSurrogate(units[end - 1]) { end -= 1 }
        return String(decoding: units[0 ..< end], as: UTF16.self)
    }

    // MARK: Matrix identifiers

    /// `!opaque[:server[:port]]`, the shapes Synapse produces.
    public static func validRoomId(_ id: String) -> Bool { sigilled(id, "!") }
    /// `$opaque[:server[:port]]`.
    public static func validEventId(_ id: String) -> Bool { sigilled(id, "$") }

    static func sigilled(_ id: String, _ sigil: Character) -> Bool {
        guard id.utf16.count <= maxIdLength, id.first == sigil else { return false }
        return opaqueId(String(id.dropFirst()))
    }

    // [A-Za-z0-9._~+=/-]{1,200} (: [A-Za-z0-9.-]{1,200} (: [0-9]{1,5})? )?
    static func opaqueId(_ s: String) -> Bool {
        let parts = s.split(separator: ":", omittingEmptySubsequences: false)
        guard (1 ... 3).contains(parts.count) else { return false }
        func all(_ p: Substring, _ range: ClosedRange<Int>, _ ok: (Unicode.Scalar) -> Bool) -> Bool {
            range.contains(p.unicodeScalars.count) && p.unicodeScalars.allSatisfy(ok)
        }
        guard all(parts[0], 1 ... 200, { isAlnum($0) || "._~+=/-".unicodeScalars.contains($0) }) else { return false }
        if parts.count >= 2, !all(parts[1], 1 ... 200, { isAlnum($0) || $0 == "." || $0 == "-" }) { return false }
        if parts.count == 3, !all(parts[2], 1 ... 5, isDigit) { return false }
        return true
    }

    static func isDigit(_ c: Unicode.Scalar) -> Bool { ("0" ... "9").contains(c) }
    static func isAlnum(_ c: Unicode.Scalar) -> Bool { ("a" ... "z").contains(c) || ("A" ... "Z").contains(c) || isDigit(c) }

    // MARK: values

    /// A non-negative whole number up to `max`.
    static func wholeNumber(_ v: JSONValue?, max: Int) -> Int? {
        guard case let .number(d)? = v, d.isFinite, d >= 0, d <= Double(max), d == d.rounded(.down) else { return nil }
        return Int(d)
    }

    /// A string of `min`...`max` UTF-16 units without control characters or non-characters
    /// (newline and tab allowed when `newlines`).
    static func plainText(_ v: JSONValue?, min: Int, max: Int, newlines: Bool) -> String? {
        guard case let .string(s)? = v else { return nil }
        let n = s.utf16.count
        guard n >= min, n <= max else { return nil }
        for c in s.unicodeScalars {
            if newlines, c == "\n" || c == "\t" { continue }
            if c.properties.generalCategory == .control || c.properties.isNoncharacterCodePoint { return nil }
        }
        return s
    }

    /// A PNG or JPEG data URL, at most `maxIconBytes` decoded and `maxIconPixels` a side, whole (a PNG's
    /// chunks with their checksums up to IEND, a JPEG's frame and scan up to its end marker). The
    /// app then decodes it and refuses it if that fails.
    public static func icon(fromDataURL v: JSONValue) -> NotificationIcon? {
        guard case let .string(url) = v else { return nil }
        let prefixes: [(String, NotificationIcon.Format)] = [("data:image/png;base64,", .png), ("data:image/jpeg;base64,", .jpeg)]
        guard let (prefix, format) = prefixes.first(where: { url.hasPrefix($0.0) }) else { return nil }
        let encoded = String(url.dropFirst(prefix.count))
        guard encoded.utf8.count <= maxIconBytes / 3 * 4 + 4,
              let data = Data(base64Encoded: encoded), !data.isEmpty, data.count <= maxIconBytes,
              let (w, h) = format == .png ? ImageHeader.pngSize(data) : ImageHeader.jpegSize(data),
              w > 0, h > 0, w <= maxIconPixels, h <= maxIconPixels,
              format == .png ? ImageHeader.pngComplete(data) : ImageHeader.jpegComplete(data) else { return nil }
        return NotificationIcon(format: format, data: data, width: w, height: h)
    }
}

/// The pixel size from an image's header, without decoding it.
enum ImageHeader {
    static func pngSize(_ d: Data) -> (Int, Int)? {
        let b = [UInt8](d.prefix(33))
        let signature: [UInt8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
        // Signature, then the IHDR chunk: length 13, "IHDR", width, height (big-endian).
        guard b.count >= 33, Array(b[0 ..< 8]) == signature, Array(b[12 ..< 16]) == Array("IHDR".utf8) else { return nil }
        return (be32(b, 16), be32(b, 20))
    }

    static func jpegSize(_ d: Data) -> (Int, Int)? {
        let b = [UInt8](d)
        guard b.count > 4, b[0] == 0xFF, b[1] == 0xD8 else { return nil }
        var i = 2
        while i + 4 <= b.count {
            guard b[i] == 0xFF else { return nil }
            let marker = b[i + 1]
            if marker == 0xFF { i += 1; continue } // fill byte
            if marker == 0xD8 || marker == 0x01 || (0xD0 ... 0xD7).contains(marker) { i += 2; continue }
            if marker == 0xD9 || marker == 0xDA { return nil } // end, or scan data before any frame header
            let length = Int(b[i + 2]) << 8 | Int(b[i + 3])
            guard length >= 2 else { return nil }
            // Start of frame: every SOFn but DHT (C4), JPG (C8) and DAC (CC).
            if (0xC0 ... 0xCF).contains(marker), ![0xC4, 0xC8, 0xCC].contains(marker) {
                guard i + 9 <= b.count, length >= 7 else { return nil }
                let h = Int(b[i + 5]) << 8 | Int(b[i + 6])
                let w = Int(b[i + 7]) << 8 | Int(b[i + 8])
                return (w, h)
            }
            i += 2 + length
        }
        return nil
    }

    /// Every chunk whole, with a good CRC: IHDR first, at least one IDAT, IEND last and nothing after it.
    static func pngComplete(_ d: Data) -> Bool {
        let b = [UInt8](d)
        guard b.count >= 8 + 25 + 12 else { return false }
        var i = 8
        var first = true
        var sawData = false
        while i + 12 <= b.count {
            let length = be32(b, i)
            guard length >= 0, length <= b.count - i - 12 else { return false }
            let type = Array(b[i + 4 ..< i + 8])
            let crcEnd = i + 8 + length
            guard crc32(b[(i + 4) ..< crcEnd]) == UInt32(be32(b, crcEnd)) else { return false }
            if first, type != Array("IHDR".utf8) { return false }
            first = false
            if type == Array("IDAT".utf8) { sawData = true }
            i = crcEnd + 4
            if type == Array("IEND".utf8) { return sawData && i == b.count }
        }
        return false
    }

    /// A frame header, a scan, and the end marker as the last two bytes.
    static func jpegComplete(_ d: Data) -> Bool {
        let b = [UInt8](d)
        guard b.count >= 4, b[b.count - 2] == 0xFF, b[b.count - 1] == 0xD9, jpegSize(d) != nil else { return false }
        // The scan follows the frame header; jpegSize stopped at the frame, so look for SOS after it.
        var i = 2
        while i + 4 <= b.count {
            guard b[i] == 0xFF else { return false }
            let marker = b[i + 1]
            if marker == 0xFF { i += 1; continue }
            if marker == 0xDA { return true }
            if marker == 0xD9 { return false }
            if marker == 0x01 || (0xD0 ... 0xD7).contains(marker) { i += 2; continue }
            let length = Int(b[i + 2]) << 8 | Int(b[i + 3])
            guard length >= 2 else { return false }
            i += 2 + length
        }
        return false
    }

    private static let crcTable: [UInt32] = (0 ..< 256).map { n -> UInt32 in
        var c = UInt32(n)
        for _ in 0 ..< 8 { c = c & 1 != 0 ? 0xEDB8_8320 ^ (c >> 1) : c >> 1 }
        return c
    }

    static func crc32(_ bytes: ArraySlice<UInt8>) -> UInt32 {
        var c: UInt32 = 0xFFFF_FFFF
        for byte in bytes { c = crcTable[Int((c ^ UInt32(byte)) & 0xFF)] ^ (c >> 8) }
        return c ^ 0xFFFF_FFFF
    }

    private static func be32(_ b: [UInt8], _ at: Int) -> Int {
        Int(b[at]) << 24 | Int(b[at + 1]) << 16 | Int(b[at + 2]) << 8 | Int(b[at + 3])
    }
}
