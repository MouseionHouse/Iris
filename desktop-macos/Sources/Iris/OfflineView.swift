import AppKit

/// Shown over the web view when Iris cannot be reached, with Retry. The words are the Linux
/// shell's (desktop/src/qml/OfflinePage.qml); the colours follow the system's light or dark.
final class OfflineView: NSView {
    var onRetry: (() -> Void)?
    private let detail = NSTextField(wrappingLabelWithString: "")

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true

        let icon = NSImageView(image: NSApp.applicationIconImage ?? NSImage())
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.widthAnchor.constraint(equalToConstant: 88).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 88).isActive = true

        let title = NSTextField(wrappingLabelWithString: "Iris can't reach the server")
        title.font = .systemFont(ofSize: 22, weight: .semibold)
        title.alignment = .center

        let hint = NSTextField(wrappingLabelWithString: "Check your connection. Iris tries again by itself when the network is back.")
        hint.font = .systemFont(ofSize: 14)
        hint.textColor = .secondaryLabelColor
        hint.alignment = .center

        detail.font = .systemFont(ofSize: 12)
        detail.textColor = .secondaryLabelColor
        detail.alignment = .center
        detail.isSelectable = true

        let retry = NSButton(title: "Retry", target: self, action: #selector(retryPressed))
        retry.bezelStyle = .rounded
        retry.controlSize = .large
        retry.keyEquivalent = "\r"

        let stack = NSStackView(views: [icon, title, hint, detail, retry])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 14
        stack.setCustomSpacing(22, after: detail)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 420),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -24),
            title.widthAnchor.constraint(equalTo: stack.widthAnchor),
            hint.widthAnchor.constraint(equalTo: stack.widthAnchor),
            detail.widthAnchor.constraint(equalTo: stack.widthAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    /// The system's description of the failure, under the hint; empty hides it.
    func setDetail(_ text: String) {
        detail.stringValue = text
        detail.isHidden = text.isEmpty
    }

    override func updateLayer() {
        layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
    }

    @objc private func retryPressed() { onRetry?() }
}
