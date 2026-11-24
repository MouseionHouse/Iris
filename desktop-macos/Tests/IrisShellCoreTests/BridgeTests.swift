@testable import IrisShellCore
import XCTest

/// The bridge's state and events (tst_irisbridge.cpp, tst_matrixuri.cpp's bridge cases,
/// tst_notifier.cpp's bookkeeping), and the navigation policy (tst_navigationpolicy.cpp).
final class BridgeTests: XCTestCase {
    private var events: [(String, String)] = []
    private var badges: [Unread] = []

    private func makeBridge() -> Bridge {
        events = []
        badges = []
        let b = Bridge(version: "1.2.3")
        b.onEvent = { [unowned self] in events.append(($0, $1)) }
        b.onUnreadChanged = { [unowned self] in badges.append($0) }
        return b
    }

    func testVersion() {
        XCTAssertEqual(makeBridge().call("version", arguments: "[]"), .success(.string("1.2.3")))
    }

    func testCallsAreDispatchedAndCheckedOnce() {
        let b = makeBridge()
        XCTAssertEqual(b.call("nope", arguments: "[]"), .failure(.unknownMethod("nope")))
        XCTAssertEqual(b.call("setUnread", arguments: "{"), .failure(.malformedArguments))
        XCTAssertEqual(b.call("setUnread", arguments: #"{"total":1}"#), .failure(.malformedArguments))
        XCTAssertEqual(b.call("setUnread", arguments: "[1, 2]"), .failure(.malformedArguments))
        XCTAssertEqual(b.call("setUnread", arguments: #"[{"total":3,"highlight":1}]"#), .success(.bool(true)))
        XCTAssertEqual(b.call("setUnread", arguments: #"[{"total":"3","highlight":1}]"#), .success(.bool(false)))
        XCTAssertEqual(b.call("setUnread", arguments: "[]"), .success(.bool(false)))
        XCTAssertEqual(b.unread, Unread(total: 3, highlight: 1))
    }

    func testSetUnreadReportsChangesOnly() {
        let b = makeBridge()
        XCTAssertTrue(b.setUnread(.object(["total": .number(7), "highlight": .number(2)])))
        XCTAssertTrue(b.setUnread(.object(["total": .number(7), "highlight": .number(2)])))
        XCTAssertFalse(b.setUnread(.object(["total": .number(1), "highlight": .number(2)])))
        XCTAssertTrue(b.setUnread(.object(["total": .number(0), "highlight": .number(0)])))
        XCTAssertEqual(badges, [Unread(total: 7, highlight: 2), Unread(total: 0, highlight: 0)])
        b.pageConnected()
        XCTAssertEqual(badges.last, Unread(total: 0, highlight: 0))
        XCTAssertEqual(badges.count, 3)
    }

    func testNotifyGoesToTheAppOnlyWhenChecked() {
        let b = makeBridge()
        var shown: [NotifyRequest] = []
        b.onNotify = { shown.append($0); return true }
        let good = #"[{"id":"$e1","roomId":"!room:example.org","title":"Kitchen","body":"hi"}]"#
        XCTAssertEqual(b.call("notify", arguments: good), .success(.bool(true)))
        XCTAssertEqual(b.call("notify", arguments: #"[{"id":"$e1","roomId":"room","title":"Kitchen","body":"hi"}]"#), .success(.bool(false)))
        XCTAssertEqual(shown.count, 1)
        // The app can still refuse (an icon that does not decode).
        b.onNotify = { _ in false }
        XCTAssertEqual(b.call("notify", arguments: good), .success(.bool(false)))
        var closed: [String] = []
        b.onCloseNotifications = { closed.append($0) }
        XCTAssertEqual(b.call("closeNotifications", arguments: #"[{"roomId":"!room:example.org"}]"#), .success(.bool(true)))
        XCTAssertEqual(b.call("closeNotifications", arguments: #"[{"roomId":"!room:example.org","x":1}]"#), .success(.bool(false)))
        XCTAssertEqual(closed, ["!room:example.org"])
    }

    func testColorSchemeIsEmittedAndRemembered() {
        let b = makeBridge()
        XCTAssertEqual(b.latestEvents(), "{}")
        b.setColorScheme(dark: true)
        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events[0].0, "colorScheme")
        XCTAssertEqual(events[0].1, #"{"dark":true}"#)
        b.setColorScheme(dark: false)
        XCTAssertEqual(JSONValue.parse(b.latestEvents()), .object(["colorScheme": .string(#"{"dark":false}"#)]))
        XCTAssertEqual(b.call("latestEvents", arguments: "[]"), .success(.string(#"{"colorScheme":"{\"dark\":false}"}"#)))
    }

    func testOpenRoomAndReplyAreEmittedButNotRemembered() {
        let b = makeBridge()
        b.openRoom(roomId: "!r:x", eventId: "$e")
        b.openRoom(roomId: "!r:x", eventId: "")
        b.reply(roomId: "!r:x", eventId: "$e", text: "hello \"there\"")
        XCTAssertEqual(events.map(\.0), ["openRoom", "openRoom", "reply"])
        XCTAssertEqual(JSONValue.parse(events[0].1), .object(["roomId": .string("!r:x"), "eventId": .string("$e")]))
        XCTAssertEqual(JSONValue.parse(events[1].1), .object(["roomId": .string("!r:x")]))
        XCTAssertEqual(JSONValue.parse(events[2].1), .object(["roomId": .string("!r:x"), "eventId": .string("$e"), "text": .string("hello \"there\"")]))
        XCTAssertEqual(b.latestEvents(), "{}")
        b.reply(roomId: "!r:x", eventId: "", text: String(repeating: "a", count: 20000))
        guard case let .object(o)? = JSONValue.parse(events[3].1), case let .string(text)? = o["text"] else { return XCTFail("no text") }
        XCTAssertEqual(text.utf16.count, BridgeChecks.maxReplyLength)
    }

    func testHoldsLinksUntilThePageAsksThenEmitsOnce() {
        let b = makeBridge()
        let a = MatrixLink(kind: .user, id: "@alice:example.org")
        let r = MatrixLink(kind: .alias, id: "#us:example.org")
        b.openLink(a)
        b.openLink(r)
        XCTAssertTrue(events.isEmpty) // cold start: nothing is sent before the page is up
        XCTAssertEqual(b.call("takePendingLinks", arguments: "[]"), .success(.strings([a.json.serialized, r.json.serialized])))
        XCTAssertTrue(events.isEmpty)
        XCTAssertEqual(b.takePendingLinks(), []) // delivered once
        b.openLink(r) // the page is up: now it is an event
        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events[0].0, "openLink")
        XCTAssertEqual(events[0].1, r.json.serialized)
        b.pageLoading() // a page that starts loading has no adapter yet: links wait again
        b.openLink(a)
        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(b.takePendingLinks(), [a.json.serialized])
    }

    func testKeepsTheNewestEightWaiting() {
        let b = makeBridge()
        for i in 0 ..< 12 { b.openLink(MatrixLink(kind: .user, id: "@user\(i):example.org")) }
        let pending = b.takePendingLinks()
        XCTAssertEqual(pending.count, Bridge.maxPendingLinks)
        XCTAssertTrue(pending.first!.contains("user4"))
        XCTAssertTrue(pending.last!.contains("user11"))
    }

    // MARK: notification bookkeeping

    func testNotificationBook() {
        var n = 0
        var book = NotificationBook(makeIdentifier: { n += 1; return "n\(n)" })
        XCTAssertEqual(book.add(roomId: "!a:x", id: "1").identifier, "n1")
        let again = book.add(roomId: "!a:x", id: "1") // same id replaces
        XCTAssertEqual(again.identifier, "n2")
        XCTAssertEqual(again.remove, ["n1"])
        XCTAssertEqual(book.openCount("!a:x"), 1)
        for i in 2 ... (NotificationBook.maxPerRoom + 3) { _ = book.add(roomId: "!a:x", id: "\(i)") }
        XCTAssertEqual(book.openCount("!a:x"), NotificationBook.maxPerRoom)
        let next = book.add(roomId: "!a:x", id: "new")
        XCTAssertEqual(next.remove.count, 1) // the oldest goes
        XCTAssertEqual(book.openCount("!a:x"), NotificationBook.maxPerRoom)
        _ = book.add(roomId: "!b:x", id: "1")
        XCTAssertEqual(book.closeRoom("!a:x").count, NotificationBook.maxPerRoom)
        XCTAssertEqual(book.openCount("!a:x"), 0)
        XCTAssertEqual(book.closeRoom("!a:x"), [])
        XCTAssertEqual(book.openCount("!b:x"), 1)
        let c = book.add(roomId: "!b:x", id: "2").identifier
        book.forget(identifier: c)
        XCTAssertEqual(book.openCount("!b:x"), 1)
        XCTAssertEqual(book.closeAll().count, 1)
        XCTAssertEqual(book.openCount("!b:x"), 0)
    }

    // MARK: navigation policy

    func testNavigationPolicy() throws {
        let policy = try XCTUnwrap(NavigationPolicy(origin: "https://iris.example.org"))
        let cases: [(String, Bool)] = [
            ("https://iris.example.org", true),
            ("https://iris.example.org/#/home/!room:example.org", true),
            ("https://iris.example.org:443/x", true),
            ("https://IRIS.example.org/", true),
            ("http://iris.example.org/", false),
            ("https://iris.example.org:8443/", false),
            ("https://example.org/", false),
            ("https://evil.iris.example.org/", false),
            ("https://hub.example.org/", false),
            ("https://iris.example.org.evil.example/", false),
            ("https://eviliris.example.org/", false),
            ("https://iris.example.org@evil.example/", false),
            ("https://user:pw@iris.example.org/", false),
            ("https://example.com/", false),
            ("file:///etc/passwd", false),
            ("javascript:alert(1)", false),
            ("data:text/html,hi", false),
            ("about:blank", false),
            ("blob:https://iris.example.org/123", false),
        ]
        for (text, allowed) in cases {
            let url = try XCTUnwrap(URL(string: text), text)
            XCTAssertEqual(policy.isAllowed(url), allowed, text)
            XCTAssertEqual(policy.bridgeOffered(url), allowed, text)
        }
        XCTAssertTrue(policy.isAllowedOrigin(scheme: "https", host: "iris.example.org", port: 0))
        XCTAssertTrue(policy.isAllowedOrigin(scheme: "https", host: "iris.example.org", port: 443))
        XCTAssertFalse(policy.isAllowedOrigin(scheme: "https", host: "iris.example.org", port: 8443))
        XCTAssertFalse(policy.isAllowedOrigin(scheme: "http", host: "iris.example.org", port: 0))
        XCTAssertFalse(policy.isAllowedOrigin(scheme: "https", host: "evil.example", port: 0))
        XCTAssertFalse(policy.isAllowedOrigin(scheme: "", host: "", port: 0))
    }

    func testOnlyWebAndMailGoOut() throws {
        for ok in ["https://example.com/a", "http://example.com/b", "mailto:a@example.com"] {
            XCTAssertTrue(NavigationPolicy.mayOpenExternally(try XCTUnwrap(URL(string: ok))), ok)
        }
        for bad in ["file:///etc/passwd", "steam://run/1", "about:blank", "javascript:alert(1)", "matrix:u/a:b.org", "x-apple.systempreferences:"] {
            XCTAssertFalse(NavigationPolicy.mayOpenExternally(try XCTUnwrap(URL(string: bad))), bad)
        }
    }

    func testIrisURL() {
        XCTAssertEqual(IrisURL("https://iris.example.org")?.origin, "https://iris.example.org")
        XCTAssertEqual(IrisURL("https://iris.example.org/")?.origin, "https://iris.example.org")
        XCTAssertEqual(IrisURL("https://iris.example.org:8443")?.url.absoluteString, "https://iris.example.org:8443/")
        for bad in ["", "http://iris.example.org", "https://", "https://iris.example.org/app", "https://a@b.org", "https://iris.example.org:", "https://iris.example.org:123456", "https://iris example.org"] {
            XCTAssertNil(IrisURL(bad), bad)
        }
    }
}
