@testable import IrisShellCore
import XCTest

/// Ported from desktop/tests/tst_matrixuri.cpp: the same URIs, the same answers.
final class MatrixURITests: XCTestCase {
    private func link(_ kind: MatrixLink.Kind, _ id: String, _ eventId: String = "", _ via: [String] = [], _ action: MatrixLink.Action? = nil) -> MatrixLink {
        MatrixLink(kind: kind, id: id, eventId: eventId, via: via, action: action)
    }

    private func parsed(_ uri: String) -> MatrixLink? {
        if case let .success(l) = MatrixURI.parse(uri) { return l }
        return nil
    }

    func testAccepts() {
        let cases: [(String, String, MatrixLink)] = [
            ("room id", "matrix:roomid/rs:example.org", link(.room, "!rs:example.org")),
            ("room id with via", "matrix:roomid/rs:example.org?via=example.org&via=alt.example.org", link(.room, "!rs:example.org", "", ["example.org", "alt.example.org"])),
            ("room id with action=join", "matrix:roomid/rs:example.org?action=join&via=example.org", link(.room, "!rs:example.org", "", ["example.org"], .join)),
            ("room id with action=chat", "matrix:roomid/rs:example.org?action=chat", link(.room, "!rs:example.org", "", [], .chat)),
            ("alias", "matrix:r/us:example.org", link(.alias, "#us:example.org")),
            ("alias, event", "matrix:r/us:example.org/e/lol823y4bcp3qo4", link(.alias, "#us:example.org", "$lol823y4bcp3qo4")),
            ("room id, event, via", "matrix:roomid/rs:example.org/e/lol823y4bcp3qo4?via=example.org", link(.room, "!rs:example.org", "$lol823y4bcp3qo4", ["example.org"])),
            ("user", "matrix:u/alice:example.org", link(.user, "@alice:example.org")),
            ("user, action=chat", "matrix:u/alice:example.org?action=chat", link(.user, "@alice:example.org", "", [], .chat)),
            ("scheme in any case", "MATRIX:u/alice:example.org", link(.user, "@alice:example.org")),
            ("percent-encoded colon", "matrix:roomid/rs%3Aexample.org", link(.room, "!rs:example.org")),
            ("percent-encoded slash in an event ID", "matrix:roomid/rs:example.org/e/a%2Fb%2Bc", link(.room, "!rs:example.org", "$a/b+c")),
            ("percent-encoded unicode alias", "matrix:r/caf%C3%A9:example.org", link(.alias, "#café:example.org")),
            ("room version 12 ID has no server", "matrix:roomid/abcDEF_ghi", link(.room, "!abcDEF_ghi")),
            ("via with a port and an IPv6 literal", "matrix:roomid/rs:example.org?via=example.org:8448&via=%5B::1%5D:8448", link(.room, "!rs:example.org", "", ["example.org:8448", "[::1]:8448"])),
            ("repeated via is kept once, in order", "matrix:roomid/rs:example.org?via=b.org&via=a.org&via=b.org", link(.room, "!rs:example.org", "", ["b.org", "a.org"])),
            ("unknown query keys are ignored", "matrix:u/alice:example.org?foo=bar&action=chat&%66oo", link(.user, "@alice:example.org", "", [], .chat)),
            ("empty query", "matrix:u/alice:example.org?", link(.user, "@alice:example.org")),
            ("empty query parts", "matrix:u/alice:example.org?&&action=chat&", link(.user, "@alice:example.org", "", [], .chat)),
            ("legacy user with uppercase and slash", "matrix:u/Alice%2Fbot:example.org", link(.user, "@Alice/bot:example.org")),
        ]
        for (name, uri, expected) in cases {
            switch MatrixURI.parse(uri) {
            case let .success(got): XCTAssertEqual(got, expected, name)
            case let .failure(why): XCTFail("\(name): \(why)")
            }
        }
    }

    func testRefuses() {
        var cases: [String] = [
            "", "matrix:", "https://matrix.to/#/#us:example.org", "mailto:alice@example.org", "javascript:alert(1)",
            "file:///etc/passwd", "matrixx:u/alice:example.org", "u/alice:example.org", " matrix:u/alice:example.org",
            "matrix:u/alice:example.org ", "matrix://example.org/u/alice:example.org", "matrix:///u/alice:example.org",
            "matrix:/u/alice:example.org", "matrix:u/alice:example.org#x", "matrix:#us:example.org", "matrix:x/alice:example.org",
            "matrix:U/alice:example.org", "matrix:u", "matrix:u/", "matrix:r//e/ev", "matrix:r/us:example.org//e/ev",
            "matrix:r/us:example.org/", "matrix:r/us:example.org/e/ev/more", "matrix:r/us:example.org/x/ev", "matrix:r/us:example.org/e",
            "matrix:r/us:example.org/e/", "matrix:u/alice:example.org/e/ev", "matrix:r/%23us:example.org", "matrix:roomid/!rs:example.org",
            "matrix:u/@alice:example.org", "matrix:r/us:example.org/e/$ev", "matrix:r/us", "matrix:r/us:exa%20mple.org",
            "matrix:r/:example.org", "matrix:r/u%20s:example.org", "matrix:u/al%0Dice:example.org", "matrix:u/alice",
            "matrix:u/alice:example.org:99999", "matrix:roomid/r%20s:example.org", "matrix:roomid/r%22s:example.org",
            "matrix:u/alice%zz:example.org", "matrix:u/alice:example.org%2", "matrix:u/alice:example.org%", "matrix:u/ali%00ce:example.org",
            "matrix:r/u%0As:example.org", "matrix:r/u%1Bs:example.org", "matrix:r/u%7Fs:example.org", "matrix:r/us%FF:example.org",
            "matrix:r/us%C0%AF:example.org", "matrix:r/us%E2%80%AE:example.org", "matrix:r/u%E2%80%8Bs:example.org",
            "matrix:r/café:example.org", "matrix:u/alice:example.org?action=chät", "matrix:u/ali\tce:example.org",
            "matrix:u/alice:example.org\nmatrix:u/bob:example.org", "matrix:u/alice:example.org\u{0}x", "matrix:u/ali\\ce:example.org",
            "matrix:roomid/rs:example.org?action=delete", "matrix:roomid/rs:example.org?action=", "matrix:roomid/rs:example.org?action",
            "matrix:roomid/rs:example.org?action=join&action=chat", "matrix:roomid/rs:example.org?action=JOIN",
            "matrix:u/alice:example.org?action=join", "matrix:u/alice:example.org?via=example.org", "matrix:roomid/rs:example.org?via=",
            "matrix:roomid/rs:example.org?via", "matrix:roomid/rs:example.org?via=example.org/evil", "matrix:roomid/rs:example.org?via=a@example.org",
            "matrix:roomid/rs:example.org?via=exa%20mple.org", "matrix:roomid/rs:example.org?via=%3Cscript%3E",
            "matrix:roomid/rs:example.org?via=-evil.org", "matrix:roomid/rs:example.org?via=example.org:70000",
            "matrix:u/alice:example.org?%zz=1", "matrix:roomid/x%22%3E%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E:example.org",
            "matrix:u/%24(touch%20%2Ftmp%2Fx):example.org", "matrix:u/a%27%3B%20DROP%20TABLE%20users%3B--:example.org",
            "matrix:r/%22%7D,%7B%22kind%22%3A%22user:example.org",
            "matrix:u/" + String(repeating: "a", count: MatrixURI.maxLength) + ":example.org",
            "matrix:u/" + String(repeating: "a", count: 300) + ":example.org",
            "matrix:u/alice:" + String(repeating: "a", count: 300),
            "matrix:roomid/rs:example.org?via=a1.org&via=a2.org&via=a3.org&via=a4.org&via=a5.org&via=a6.org&via=a7.org&via=a8.org&via=a9.org&via=a10.org&via=a11.org",
        ]
        // A combining mark after a separator must not hide it.
        cases.append("matrix:u/alice:example.org?\u{301}action=chat")
        for uri in cases {
            switch MatrixURI.parse(uri) {
            case let .success(l): XCTFail("accepted \(uri.debugDescription) as \(l)")
            case let .failure(why): XCTAssertFalse(why.description.isEmpty)
            }
        }
    }

    func testAtTheLimits() {
        let atLimit = "matrix:u/alice:example.org?x=" + String(repeating: "a", count: MatrixURI.maxLength - 29)
        XCTAssertEqual(atLimit.utf16.count, MatrixURI.maxLength)
        XCTAssertNotNil(parsed(atLimit))
        XCTAssertNil(parsed(atLimit + "a"))
        var ten = "matrix:roomid/rs:example.org?"
        for i in 1 ... 10 { ten += "via=a\(i).org&" }
        XCTAssertEqual(parsed(ten)?.via.count, 10)
        XCTAssertNotNil(parsed("matrix:roomid/rs:example.org/e/" + String(repeating: "a", count: 200)))
        XCTAssertNil(parsed("matrix:roomid/rs:example.org/e/" + String(repeating: "a", count: 201)))
    }

    func testDoesNotCrashOnNoise() {
        let alphabet = Array("matrix:/?&=%#@!$.-_ur:eE0123456789abcdefABCDEF\\\" \n")
        var seed: UInt32 = 12345
        func next() -> Int {
            seed = seed &* 1_664_525 &+ 1_013_904_223
            return Int(seed >> 8)
        }
        var accepted = 0
        for i in 0 ..< 20000 {
            var s = i % 2 == 1 ? "matrix:" : ""
            for _ in 0 ..< next() % 60 { s.append(alphabet[next() % alphabet.count]) }
            if let l = parsed(s) {
                accepted += 1
                XCTAssertTrue(["!", "#", "@"].contains(l.id.first))
                XCTAssertTrue(l.eventId.isEmpty || l.eventId.hasPrefix("$"))
            }
        }
        print("noise: \(accepted) accepted of 20000")
    }

    func testJSONPayload() {
        XCTAssertEqual(link(.user, "@a:b.org").json.serialized, #"{"id":"@a:b.org","kind":"user"}"#)
        XCTAssertEqual(link(.alias, "#a:b.org", "$e", ["x.org", "y.org"], .join).json,
                       .object(["kind": .string("alias"), "id": .string("#a:b.org"), "eventId": .string("$e"), "via": .array([.string("x.org"), .string("y.org")]), "action": .string("join")]))
        XCTAssertEqual(link(.room, "!r:b.org", "", [], .chat).json, .object(["kind": .string("room"), "id": .string("!r:b.org"), "action": .string("chat")]))
    }

    func testServerNames() {
        for ok in ["example.org", "example.org:8448", "[::1]", "[::1]:8448", "1.2.3.4", "a"] {
            XCTAssertTrue(MatrixURI.validServerName(ok), ok)
        }
        for bad in ["", "-a.org", "a_b.org", "[::1", "[]", "[::1]x", "a.org:", "a.org:123456", "a.org:65536", "a.org:1:2", String(repeating: "a", count: 256)] {
            XCTAssertFalse(MatrixURI.validServerName(bad), bad)
        }
    }
}
