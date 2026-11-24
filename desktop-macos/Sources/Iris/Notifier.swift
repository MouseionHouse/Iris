import AppKit
import ImageIO
import IrisShellCore
import UniformTypeIdentifiers
import UserNotifications

/// Shows the page's notifications through `UNUserNotificationCenter` (so System Settings →
/// Notifications lists Iris and Focus applies) and keeps track of them per room: the same `id`
/// replaces, at most five per room stay up, a room's close together. A click opens the room; the
/// Reply action sends its text to the page. The counterpart of desktop/src/notifier.*.
final class Notifier: NSObject, UNUserNotificationCenterDelegate {
    static let messageCategory = "message"
    static let messageNoReplyCategory = "message-noreply"
    static let replyAction = "reply"

    /// A click on a notification: show the window and the room.
    var onOpenRoom: ((_ roomId: String, _ eventId: String) -> Void)?
    /// Text typed into a notification's reply field.
    var onReply: ((_ roomId: String, _ eventId: String, _ text: String) -> Void)?

    private let center = UNUserNotificationCenter.current()
    private var book = NotificationBook()
    private let iconDir: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent(Shell.bundleId, isDirectory: true)
        .appendingPathComponent("notification-icons", isDirectory: true)

    /// Set as the delegate before the app finishes launching, so a click that launched it is heard.
    func start() {
        center.delegate = self
        let reply = UNTextInputNotificationAction(identifier: Notifier.replyAction, title: "Reply", options: [],
                                                  textInputButtonTitle: "Send", textInputPlaceholder: "Reply")
        center.setNotificationCategories([
            UNNotificationCategory(identifier: Notifier.messageCategory, actions: [reply], intentIdentifiers: [], options: [.customDismissAction]),
            UNNotificationCategory(identifier: Notifier.messageNoReplyCategory, actions: [], intentIdentifiers: [], options: [.customDismissAction]),
        ])
        try? FileManager.default.removeItem(at: iconDir)
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            Log.state("notification-authorization granted=\(granted)\(error.map { " error=\($0.localizedDescription)" } ?? "")")
            self.logSettings()
        }
    }

    func logSettings() {
        center.getNotificationSettings { s in
            Log.state("notification-settings authorization=\(s.authorizationStatus.rawValue) alert=\(s.alertSetting.rawValue) badge=\(s.badgeSetting.rawValue) style=\(s.alertStyle.rawValue)")
        }
    }

    /// Shows a checked request. False when its icon does not decode (the page's promise rejects).
    func notify(_ r: NotifyRequest) -> Bool {
        var iconFile: URL?
        if let icon = r.icon {
            guard Notifier.decodes(icon) else {
                Log.info("Refused a notification: its icon does not decode")
                return false
            }
            iconFile = writeIcon(icon)
        }
        let (identifier, remove) = book.add(roomId: r.roomId, id: r.id)
        removeNotifications(remove)

        let content = UNMutableNotificationContent()
        content.title = r.title
        content.body = r.body
        content.threadIdentifier = r.roomId
        content.categoryIdentifier = r.canReply ? Notifier.messageCategory : Notifier.messageNoReplyCategory
        content.userInfo = ["roomId": r.roomId, "eventId": r.eventId]
        // The page plays its own sound (Settings → Notifications → Notification sound).
        content.sound = nil
        if let iconFile, let icon = r.icon,
           let attachment = try? UNNotificationAttachment(identifier: "icon", url: iconFile, options: [
               UNNotificationAttachmentOptionsTypeHintKey: (icon.format == .png ? UTType.png : UTType.jpeg).identifier,
           ]) {
            content.attachments = [attachment]
        }
        center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: nil)) { error in
            if let error {
                Log.error("Notification not shown: \(error.localizedDescription)")
                Log.state("notification-failed")
            } else {
                Log.state("notification-shown reply=\(r.canReply) icon=\(r.icon != nil)")
            }
        }
        return true
    }

    /// The whole image is there and decodes, in the format its header claims.
    static func decodes(_ icon: NotificationIcon) -> Bool {
        let type = (icon.format == .png ? UTType.png : UTType.jpeg).identifier as CFString
        guard let source = CGImageSourceCreateWithData(icon.data as CFData, [kCGImageSourceTypeIdentifierHint: type] as CFDictionary),
              CGImageSourceGetType(source) as String? == type as String,
              CGImageSourceGetStatus(source) == .statusComplete,
              CGImageSourceGetStatusAtIndex(source, 0) == .statusComplete,
              let image = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
        else { return false }
        // ImageIO decodes lazily, and an image whose data does not decode still comes back; asking
        // for its pixels is what decodes it, and gives nothing when that fails.
        guard let pixels = image.dataProvider?.data, CFDataGetLength(pixels) > 0 else { return false }
        return image.width == icon.width && image.height == icon.height
    }

    /// Closes every notification of the room (it was read).
    func closeRoom(_ roomId: String) {
        let ids = book.closeRoom(roomId)
        removeNotifications(ids)
        if !ids.isEmpty { Log.state("notifications-closed count=\(ids.count)") }
    }

    func openCount(_ roomId: String) -> Int { book.openCount(roomId) }

    /// At quit: a notification that outlives the shell could not be clicked or answered.
    func closeAll() {
        removeNotifications(book.closeAll())
        try? FileManager.default.removeItem(at: iconDir)
    }

    private func removeNotifications(_ ids: [String]) {
        guard !ids.isEmpty else { return }
        center.removeDeliveredNotifications(withIdentifiers: ids)
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }

    /// The system takes the file over (it moves it into its own store), so each gets its own.
    private func writeIcon(_ icon: NotificationIcon) -> URL? {
        do {
            try FileManager.default.createDirectory(at: iconDir, withIntermediateDirectories: true)
            let url = iconDir.appendingPathComponent(UUID().uuidString + (icon.format == .png ? ".png" : ".jpg"))
            try icon.data.write(to: url)
            return url
        } catch {
            Log.error("Notification icon not written: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: UNUserNotificationCenterDelegate

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // The page decides whether a message is worth a notification (it skips the room on screen),
        // so a notification shows while Iris is in front too.
        completionHandler([.banner, .list])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let request = response.notification.request
        let info = request.content.userInfo
        let roomId = info["roomId"] as? String ?? ""
        let eventId = info["eventId"] as? String ?? ""
        let action = response.actionIdentifier
        let text = (response as? UNTextInputNotificationResponse)?.userText
        DispatchQueue.main.async {
            self.book.forget(identifier: request.identifier)
            // Only a room ID the shell itself put there is acted on.
            guard BridgeChecks.validRoomId(roomId), eventId.isEmpty || BridgeChecks.validEventId(eventId) else { return }
            switch action {
            case UNNotificationDefaultActionIdentifier:
                Log.state("notification-activated")
                self.onOpenRoom?(roomId, eventId)
            case Notifier.replyAction:
                if let text, !text.isEmpty {
                    Log.state("notification-replied")
                    self.onReply?(roomId, eventId, text)
                }
            default:
                break // dismissed
            }
        }
        completionHandler()
    }
}
