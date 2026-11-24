import Foundation

/// What `window.irisDesktop` does, apart from the platform: a port of `IrisBridge` in
/// `desktop/src/irisbridge.*`. The contract is `desktop/BRIDGE.md`. The app wires the callbacks to
/// the Dock, `UNUserNotificationCenter` and the web view; nothing here touches AppKit, so it is tested
/// on its own.
public final class Bridge {
    /// A call's answer, as the adapter's promise resolves with it.
    public enum Reply: Equatable {
        case string(String)
        case bool(Bool)
        case strings([String])
    }

    public enum CallError: Error, Equatable {
        case unknownMethod(String)
        case malformedArguments
    }

    /// At most this many `matrix:` links wait for the page; the oldest go.
    public static let maxPendingLinks = 8

    public let version: String
    public private(set) var unread = Unread(total: 0, highlight: 0)

    /// The badge to show. Also called again by `pageConnected()`.
    public var onUnreadChanged: ((Unread) -> Void)?
    /// A checked notification. The app returns false when it cannot show it (the icon does not
    /// decode), and the page's promise rejects.
    public var onNotify: ((NotifyRequest) -> Bool)?
    public var onCloseNotifications: ((String) -> Void)?
    /// Native to web: an event for `irisDesktop.on(name, handler)`, its payload as JSON text.
    public var onEvent: ((_ name: String, _ payload: String) -> Void)?

    private var latest: [String: String] = [:]
    private var pendingLinks: [String] = []
    private var linksLive = false

    public init(version: String) {
        self.version = version
    }

    // MARK: web -> native

    /// One call from the page: a method name and its arguments as JSON text (`[]` or `[arg]`).
    public func call(_ method: String, arguments: String) -> Result<Reply, CallError> {
        guard case let .array(args)? = JSONValue.parse(arguments), args.count <= 1 else { return .failure(.malformedArguments) }
        let arg = args.first ?? .null
        switch method {
        case "version": return .success(.string(version))
        case "setUnread": return .success(.bool(setUnread(arg)))
        case "notify": return .success(.bool(notify(arg)))
        case "closeNotifications": return .success(.bool(closeNotifications(arg)))
        case "latestEvents": return .success(.string(latestEvents()))
        case "takePendingLinks": return .success(.strings(takePendingLinks()))
        default: return .failure(.unknownMethod(method))
        }
    }

    /// `{ total, highlight }`; false (and nothing changes) unless it passes `BridgeChecks.unread`.
    public func setUnread(_ args: JSONValue) -> Bool {
        guard let u = BridgeChecks.unread(args) else { return false }
        if u != unread {
            unread = u
            onUnreadChanged?(u)
        }
        return true
    }

    public func notify(_ args: JSONValue) -> Bool {
        guard let r = BridgeChecks.notification(args) else { return false }
        return onNotify?(r) ?? false
    }

    public func closeNotifications(_ args: JSONValue) -> Bool {
        guard let roomId = BridgeChecks.closeTarget(args) else { return false }
        onCloseNotifications?(roomId)
        return true
    }

    /// The latest value of each sticky event, `{ name: payloadJSON }`, so a handler added after the
    /// event was emitted still learns the current state.
    public func latestEvents() -> String {
        JSONValue.object(latest.mapValues { .string($0) }).serialized
    }

    /// The adapter is up: hands over the queued links (oldest first); from now on links are events.
    public func takePendingLinks() -> [String] {
        linksLive = true
        defer { pendingLinks = [] }
        return pendingLinks
    }

    // MARK: native -> web

    /// `colorScheme { dark }`, remembered for `latestEvents()`.
    public func setColorScheme(dark: Bool) {
        let payload = JSONValue.object(["dark": .bool(dark)]).serialized
        latest["colorScheme"] = payload
        onEvent?("colorScheme", payload)
    }

    /// A notification was clicked. Not remembered.
    public func openRoom(roomId: String, eventId: String) {
        var o: [String: JSONValue] = ["roomId": .string(roomId)]
        if !eventId.isEmpty { o["eventId"] = .string(eventId) }
        onEvent?("openRoom", JSONValue.object(o).serialized)
    }

    /// Text typed into a notification's reply field, cut at `BridgeChecks.maxReplyLength`. Not remembered.
    public func reply(roomId: String, eventId: String, text: String) {
        var o: [String: JSONValue] = ["roomId": .string(roomId), "text": .string(BridgeChecks.cutReply(text))]
        if !eventId.isEmpty { o["eventId"] = .string(eventId) }
        onEvent?("reply", JSONValue.object(o).serialized)
    }

    /// A `matrix:` link. Queued until the page's adapter has asked for the pending links, then an event.
    public func openLink(_ link: MatrixLink) {
        let payload = link.json.serialized
        if linksLive {
            onEvent?("openLink", payload)
            return
        }
        pendingLinks.append(payload)
        if pendingLinks.count > Bridge.maxPendingLinks { pendingLinks.removeFirst(pendingLinks.count - Bridge.maxPendingLinks) }
    }

    /// A page is loading (possibly a reload): its adapter is not up until it asks again.
    public func pageLoading() {
        linksLive = false
    }

    /// A page on the allowed origin finished loading: say the badge again.
    public func pageConnected() {
        onUnreadChanged?(unread)
    }
}

/// Which notifications are up, per room: the same `id` replaces, at most `maxPerRoom` per room stay
/// up (the oldest goes), and a room's notifications close together. The app shows and removes them
/// under the identifiers this hands out.
public struct NotificationBook {
    public static let maxPerRoom = 5

    private struct Shown {
        var id: String
        var identifier: String
    }

    private var byRoom: [String: [Shown]] = [:]
    private let makeIdentifier: () -> String

    public init(makeIdentifier: @escaping () -> String = { "iris-" + UUID().uuidString }) {
        self.makeIdentifier = makeIdentifier
    }

    /// A new notification: the identifier to show it under, and the identifiers to remove first.
    public mutating func add(roomId: String, id: String) -> (identifier: String, remove: [String]) {
        var shown = byRoom[roomId] ?? []
        var remove = shown.filter { $0.id == id }.map(\.identifier)
        shown.removeAll { $0.id == id }
        while shown.count >= NotificationBook.maxPerRoom {
            remove.append(shown.removeFirst().identifier)
        }
        let identifier = makeIdentifier()
        shown.append(Shown(id: id, identifier: identifier))
        byRoom[roomId] = shown
        return (identifier, remove)
    }

    /// Closes the room's notifications: the identifiers to remove.
    public mutating func closeRoom(_ roomId: String) -> [String] {
        (byRoom.removeValue(forKey: roomId) ?? []).map(\.identifier)
    }

    /// One went away by itself (dismissed, clicked, replied to).
    public mutating func forget(identifier: String) {
        for (room, shown) in byRoom {
            let left = shown.filter { $0.identifier != identifier }
            if left.count != shown.count {
                byRoom[room] = left.isEmpty ? nil : left
            }
        }
    }

    /// Everything that is up, for closing all at quit.
    public mutating func closeAll() -> [String] {
        defer { byRoom = [:] }
        return byRoom.values.flatMap { $0.map(\.identifier) }
    }

    public func openCount(_ roomId: String) -> Int { byRoom[roomId]?.count ?? 0 }
}
