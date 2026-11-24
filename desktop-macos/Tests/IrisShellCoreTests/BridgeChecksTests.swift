@testable import IrisShellCore
import XCTest

/// Ported from desktop/tests/tst_irisbridge.cpp: the same cases, the same answers.
final class BridgeChecksTests: XCTestCase {
    // MARK: JSON

    func testJSONKeepsTypesApart() {
        XCTAssertEqual(JSONValue.parse("[true, 1, 1.5, \"1\", null, {\"a\": [false]}]"),
                       .array([.bool(true), .number(1), .number(1.5), .string("1"), .null, .object(["a": .array([.bool(false)])])]))
        XCTAssertEqual(JSONValue.parse("0"), .number(0))
        XCTAssertEqual(JSONValue.parse("false"), .bool(false))
        XCTAssertNil(JSONValue.parse("{"))
        XCTAssertNil(JSONValue.parse("undefined"))
        XCTAssertNil(JSONValue.parse("NaN"))
    }

    func testJSONRefusesLoneSurrogates() {
        XCTAssertEqual(JSONValue.parse(#"["\ud83d\ude00"]"#), .array([.string("😀")]))
        XCTAssertNil(JSONValue.parse(#"["a\ud800"]"#))
        XCTAssertNil(JSONValue.parse(#"["\udc00b"]"#))
        XCTAssertNil(JSONValue.parse(#"["\ud800\ud800\udc00"]"#))
        XCTAssertNil(JSONValue.parse(#"["\ud800\n"]"#))
        // An escaped backslash is just text.
        XCTAssertEqual(JSONValue.parse(#"["\\x"]"#), .array([.string("\\x")]))
    }

    func testJSONSerializes() {
        XCTAssertEqual(JSONValue.object(["dark": .bool(true)]).serialized, #"{"dark":true}"#)
        XCTAssertEqual(JSONValue.object(["b": .number(2), "a": .string("x\"y\n\u{1}\u{2028}")]).serialized, #"{"a":"x\"y\n\u0001\u2028","b":2}"#)
        XCTAssertEqual(JSONValue.array([.null, .number(1.5)]).serialized, "[null,1.5]")
        let tricky = "hello \"there\" \\ </script> 😀"
        XCTAssertEqual(JSONValue.parse(JSONValue.string(tricky).serialized), .string(tricky))
    }

    // MARK: setUnread

    private func counts(_ total: JSONValue, _ highlight: JSONValue) -> JSONValue { .object(["total": total, "highlight": highlight]) }

    func testUnreadAcceptsCounts() {
        XCTAssertEqual(BridgeChecks.unread(counts(.number(7), .number(2))), Unread(total: 7, highlight: 2))
        XCTAssertEqual(BridgeChecks.unread(counts(.number(9.0), .number(0))), Unread(total: 9, highlight: 0))
        XCTAssertEqual(BridgeChecks.unread(counts(.number(0), .number(0))), Unread(total: 0, highlight: 0))
        let max = Double(BridgeChecks.maxUnread)
        XCTAssertEqual(BridgeChecks.unread(counts(.number(max), .number(max))), Unread(total: 1_000_000, highlight: 1_000_000))
    }

    func testUnreadRefusesBadArguments() {
        let cases: [(String, JSONValue)] = [
            ("empty", .object([:])),
            ("no highlight", .object(["total": .number(1)])),
            ("no total", .object(["highlight": .number(1)])),
            ("extra key", .object(["total": .number(1), "highlight": .number(0), "x": .number(1)])),
            ("string", counts(.string("3"), .number(0))),
            ("bool", counts(.bool(true), .number(0))),
            ("null", counts(.null, .number(0))),
            ("negative", counts(.number(-1), .number(0))),
            ("fraction", counts(.number(1.5), .number(0))),
            ("nan", counts(.number(.nan), .number(0))),
            ("infinity", counts(.number(.infinity), .number(0))),
            ("too big", counts(.number(Double(BridgeChecks.maxUnread + 1)), .number(0))),
            ("highlight above total", counts(.number(1), .number(2))),
            ("not an object", .array([.number(1), .number(0)])),
        ]
        for (name, args) in cases {
            XCTAssertNil(BridgeChecks.unread(args), name)
        }
    }

    // MARK: Matrix IDs

    func testMatrixIdsHaveTheRightShape() {
        let cases: [(String, Bool, Bool)] = [
            ("!abc:example.org", true, false),
            ("!abc:example.org:8448", true, false),
            ("!abcDEF-_123", true, false),
            ("$aGVsbG8-_/+=", false, true),
            ("$abc:example.org", false, true),
            ("", false, false),
            ("!", false, false),
            ("#room:example.org", false, false),
            ("!ab c:example.org", false, false),
            ("!abc:example.org\n", false, false),
            ("!<b>:example.org", false, false),
            ("!a:b:c:d", false, false),
            ("!" + String(repeating: "a", count: 300) + ":x", false, false),
            ("!a:example.org:123456", false, false),
            ("!a::1", false, false),
        ]
        for (id, room, event) in cases {
            XCTAssertEqual(BridgeChecks.validRoomId(id), room, "room \(id)")
            XCTAssertEqual(BridgeChecks.validEventId(id), event, "event \(id)")
        }
    }

    // MARK: notify

    static func good() -> [String: JSONValue] {
        ["id": .string("$e1"), "roomId": .string("!room:example.org"), "eventId": .string("$e1"), "title": .string("Kitchen"), "body": .string("New inbox notification from Sam")]
    }

    func testNotifyPassesACheckedRequestOn() {
        var n = Self.good()
        n["icon"] = .string(Images.dataURL(Images.png(width: 96, height: 96)))
        n["canReply"] = .bool(false)
        let r = BridgeChecks.notification(.object(n))
        XCTAssertEqual(r?.id, "$e1")
        XCTAssertEqual(r?.roomId, "!room:example.org")
        XCTAssertEqual(r?.eventId, "$e1")
        XCTAssertEqual(r?.title, "Kitchen")
        XCTAssertEqual(r?.body, "New inbox notification from Sam")
        XCTAssertEqual(r?.icon?.width, 96)
        XCTAssertEqual(r?.icon?.height, 96)
        XCTAssertEqual(r?.icon?.format, .png)
        XCTAssertEqual(r?.canReply, false)
    }

    func testNotifyMinimalAndJpeg() {
        var n = Self.good()
        n["eventId"] = nil
        n["body"] = .string("")
        let minimal = BridgeChecks.notification(.object(n))
        XCTAssertNotNil(minimal)
        XCTAssertEqual(minimal?.canReply, true) // the default
        XCTAssertNil(minimal?.icon)
        XCTAssertEqual(minimal?.eventId, "")
        n["icon"] = .string(Images.dataURL(Images.jpeg(width: 32, height: 20), mime: "image/jpeg"))
        let jpeg = BridgeChecks.notification(.object(n))
        XCTAssertEqual(jpeg?.icon?.format, .jpeg)
        XCTAssertEqual(jpeg?.icon?.width, 32)
        XCTAssertEqual(jpeg?.icon?.height, 20)
        // Newlines and tabs are fine in a body, other control characters are not.
        n["body"] = .string("line one\nline two\t!")
        XCTAssertNotNil(BridgeChecks.notification(.object(n)))
        // Limits are in UTF-16 units: 100 emoji are 200 units, the longest title.
        n["title"] = .string(String(repeating: "😀", count: 100))
        XCTAssertNotNil(BridgeChecks.notification(.object(n)))
        n["title"] = .string(String(repeating: "😀", count: 100) + "a")
        XCTAssertNil(BridgeChecks.notification(.object(n)))
    }

    func testNotifyRefusesBadArguments() {
        let cases: [(String, String, JSONValue?)] = [
            ("id missing", "id", nil),
            ("id number", "id", .number(5)),
            ("id empty", "id", .string("")),
            ("id too long", "id", .string(String(repeating: "a", count: BridgeChecks.maxIdLength + 1))),
            ("id newline", "id", .string("a\nb")),
            ("roomId missing", "roomId", nil),
            ("roomId not a room", "roomId", .string("#room:example.org")),
            ("roomId an event", "roomId", .string("$e1")),
            ("roomId list", "roomId", .array([.string("!a:b")])),
            ("eventId not an event", "eventId", .string("!room:example.org")),
            ("eventId number", "eventId", .number(1)),
            ("eventId empty", "eventId", .string("")),
            ("eventId null", "eventId", .null),
            ("title missing", "title", nil),
            ("title empty", "title", .string("")),
            ("title too long", "title", .string(String(repeating: "a", count: BridgeChecks.maxTitleLength + 1))),
            ("title control", "title", .string("a\u{07}")),
            ("title newline", "title", .string("a\nb")),
            ("title null", "title", .null),
            ("title noncharacter", "title", .string("a\u{FFFF}")),
            ("body missing", "body", nil),
            ("body number", "body", .number(3.5)),
            ("body too long", "body", .string(String(repeating: "a", count: BridgeChecks.maxBodyLength + 1))),
            ("body control", "body", .string("a\u{1b}[2J")),
            ("body C1 control", "body", .string("a\u{85}")),
            ("canReply string", "canReply", .string("yes")),
            ("canReply number", "canReply", .number(1)),
            ("canReply null", "canReply", .null),
            ("icon url", "icon", .string("https://example.org/a.png")),
            ("icon file", "icon", .string("file:///etc/passwd")),
            ("icon svg", "icon", .string("data:image/svg+xml;base64,PHN2Zy8+")),
            ("icon not base64", "icon", .string("data:image/png;base64,@@@@")),
            ("icon not an image", "icon", .string("data:image/png;base64,AAAAAAAA")),
            ("icon empty", "icon", .string("data:image/png;base64,")),
            ("icon number", "icon", .number(1)),
            ("icon null", "icon", .null),
            ("extra key", "path", .string("/etc/passwd")),
        ]
        for (name, key, value) in cases {
            var n = Self.good()
            n[key] = value
            XCTAssertNil(BridgeChecks.notification(.object(n)), name)
        }
        XCTAssertNil(BridgeChecks.notification(.array([])), "not an object")
        XCTAssertNil(BridgeChecks.notification(.null), "null")
    }

    func testNotifyRefusesAnOversizedOrBrokenIcon() {
        var n = Self.good()
        n["icon"] = .string(Images.dataURL(Images.png(width: BridgeChecks.maxIconPixels + 1, height: 8)))
        XCTAssertNil(BridgeChecks.notification(.object(n)), "too many pixels")
        n["icon"] = .string(Images.dataURL(Images.png(width: 8, height: BridgeChecks.maxIconPixels + 1)))
        XCTAssertNil(BridgeChecks.notification(.object(n)), "too many pixels, tall")
        n["icon"] = .string(Images.dataURL(Images.png(width: 0, height: 8)))
        XCTAssertNil(BridgeChecks.notification(.object(n)), "no pixels")
        n["icon"] = .string(Images.dataURL(Images.png(width: 600, height: 600, padding: BridgeChecks.maxIconBytes)))
        XCTAssertNil(BridgeChecks.notification(.object(n)), "too many bytes")
        n["icon"] = .string(Images.dataURL(Images.png(width: 1024, height: 1024, padding: BridgeChecks.maxIconBytes - 100)))
        XCTAssertNotNil(BridgeChecks.notification(.object(n)), "at the limits")
        n["icon"] = .string(String(Images.dataURL(Images.png(width: 16, height: 16)).prefix(60)))
        XCTAssertNil(BridgeChecks.notification(.object(n)), "header cut short")
        n["icon"] = .string(Images.dataURL(Images.jpeg(width: 16, height: 16)))
        XCTAssertNil(BridgeChecks.notification(.object(n)), "a JPEG declared as a PNG")
        n["icon"] = .string(Images.dataURL(Images.png(width: 16, height: 16), mime: "image/jpeg"))
        XCTAssertNil(BridgeChecks.notification(.object(n)), "a PNG declared as a JPEG")
        n["icon"] = .string(Images.dataURL(Data([0xFF, 0xD8, 0xFF, 0xDA, 0, 2, 1, 2]), mime: "image/jpeg"))
        XCTAssertNil(BridgeChecks.notification(.object(n)), "a JPEG without a frame header")
        // Whole images only.
        let png = Images.png(width: 16, height: 16, padding: 40)
        n["icon"] = .string(Images.dataURL(png.prefix(png.count - 12)))
        XCTAssertNil(BridgeChecks.notification(.object(n)), "a PNG without IEND")
        n["icon"] = .string(Images.dataURL(png.prefix(50)))
        XCTAssertNil(BridgeChecks.notification(.object(n)), "a PNG cut in its IDAT")
        n["icon"] = .string(Images.dataURL(png + Data([0])))
        XCTAssertNil(BridgeChecks.notification(.object(n)), "bytes after IEND")
        var badCrc = png
        badCrc[40] ^= 0xFF
        n["icon"] = .string(Images.dataURL(badCrc))
        XCTAssertNil(BridgeChecks.notification(.object(n)), "a PNG chunk with a bad CRC")
        var noData = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        noData.append(Images.chunk("IHDR", [0, 0, 0, 16, 0, 0, 0, 16, 8, 6, 0, 0, 0]))
        noData.append(Images.chunk("IEND", []))
        n["icon"] = .string(Images.dataURL(noData))
        XCTAssertNil(BridgeChecks.notification(.object(n)), "a PNG without IDAT")
        n["icon"] = .string(Images.dataURL(Images.jpeg(width: 16, height: 16, end: false), mime: "image/jpeg"))
        XCTAssertNil(BridgeChecks.notification(.object(n)), "a JPEG without its end marker")
        n["icon"] = .string(Images.dataURL(Images.jpeg(width: 16, height: 16, scan: false), mime: "image/jpeg"))
        XCTAssertNil(BridgeChecks.notification(.object(n)), "a JPEG without a scan")
    }

    func testCloseNotificationsChecksTheRoom() {
        XCTAssertEqual(BridgeChecks.closeTarget(.object(["roomId": .string("!room:example.org")])), "!room:example.org")
        XCTAssertNil(BridgeChecks.closeTarget(.object([:])))
        XCTAssertNil(BridgeChecks.closeTarget(.object(["roomId": .string("room")])))
        XCTAssertNil(BridgeChecks.closeTarget(.object(["roomId": .number(3)])))
        XCTAssertNil(BridgeChecks.closeTarget(.object(["roomId": .string("!a:b"), "x": .number(1)])))
    }

    func testReplyIsCutWithoutSplittingAPair() {
        XCTAssertEqual(BridgeChecks.cutReply("hi"), "hi")
        let long = String(repeating: "a", count: BridgeChecks.maxReplyLength + 10)
        XCTAssertEqual(BridgeChecks.cutReply(long).utf16.count, BridgeChecks.maxReplyLength)
        let emoji = String(repeating: "a", count: BridgeChecks.maxReplyLength - 1) + "😀"
        XCTAssertEqual(BridgeChecks.cutReply(emoji).utf16.count, BridgeChecks.maxReplyLength - 1)
    }
}

/// Image bytes with just enough of a header for the checks (the app decodes the real thing).
enum Images {
    /// A PNG whose chunks are whole (IHDR, IDAT, IEND, good CRCs); its IDAT holds `padding` bytes
    /// that are not image data, which only the app's decoder notices.
    static func png(width: Int, height: Int, padding: Int = 0, idat: [UInt8]? = nil) -> Data {
        var d = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        d.append(chunk("IHDR", be32(width) + be32(height) + [8, 6, 0, 0, 0]))
        d.append(chunk("IDAT", idat ?? [UInt8](repeating: 0, count: max(padding, 1))))
        d.append(chunk("IEND", []))
        return d
    }

    static func chunk(_ type: String, _ body: [UInt8]) -> Data {
        let typed = Array(type.utf8) + body
        return Data(be32(body.count) + typed + be32(Int(ImageHeader.crc32(typed[...]))))
    }

    static func jpeg(width: Int, height: Int, end: Bool = true, scan: Bool = true) -> Data {
        var d = Data([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10])
        d.append(contentsOf: Array("JFIF".utf8) + [0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
        d.append(contentsOf: [0xFF, 0xC0, 0x00, 0x11, 0x08, UInt8(height >> 8), UInt8(height & 0xFF), UInt8(width >> 8), UInt8(width & 0xFF), 3])
        d.append(contentsOf: [1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
        if scan { d.append(contentsOf: [0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x12, 0x34]) }
        if end { d.append(contentsOf: [0xFF, 0xD9]) }
        return d
    }

    static func dataURL(_ d: Data, mime: String = "image/png") -> String {
        "data:\(mime);base64," + d.base64EncodedString()
    }

    private static func be32(_ v: Int) -> [UInt8] {
        [UInt8(v >> 24 & 0xFF), UInt8(v >> 16 & 0xFF), UInt8(v >> 8 & 0xFF), UInt8(v & 0xFF)]
    }
}
