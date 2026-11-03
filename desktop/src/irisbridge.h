#pragma once

#include "matrixuri.h"
#include "notifier.h"

#include <QHash>
#include <QObject>
#include <QString>
#include <QUrl>
#include <QVariantMap>

class NavigationPolicy;
class QWebChannel;

// What the page can call: window.irisDesktop. Methods come from the contract in mouseion/iris#63;
// arguments come from a page we do not control, so each one is checked here.
class IrisBridge : public QObject
{
    Q_OBJECT
public:
    explicit IrisBridge(QObject *parent = nullptr);

    // Upper bound for an unread count; anything above is refused as nonsense, not clamped.
    static constexpr int maxUnread = 1000000;

    Q_INVOKABLE QString version() const;
    // { total, highlight }: whole numbers, 0 <= highlight <= total <= maxUnread. Returns false and
    // changes nothing otherwise.
    Q_INVOKABLE bool setUnread(const QVariantMap &counts);
    // { id, roomId, eventId?, title, body, icon?, canReply? }: see the limits below. Returns false and
    // shows nothing when anything is off; `icon` must be a PNG or JPEG data URL (nothing is fetched).
    Q_INVOKABLE bool notify(const QVariantMap &notification);
    // { roomId }: closes that room's notifications.
    Q_INVOKABLE bool closeNotifications(const QVariantMap &target);
    // The latest value of each sticky event ({ name: payload }, as JSON), so a handler added after
    // the event was emitted still learns the current state.
    Q_INVOKABLE QString latestEvents() const;

    // Limits for notify(); lengths are in UTF-16 units, sizes in bytes.
    static constexpr int maxIdLength = 255; // also Matrix's own limit for room and event IDs
    static constexpr int maxTitleLength = 200;
    static constexpr int maxBodyLength = 2000;
    static constexpr int maxReplyLength = 16000; // what a reply typed in a popup can carry to the page
    static constexpr int maxIconBytes = 256 * 1024; // decoded
    static constexpr int maxIconPixels = 1024; // either side
    // Matrix identifiers: "!opaque:server" / "$opaque[:server]" in the shapes Synapse produces.
    static bool validRoomId(const QString &id);
    static bool validEventId(const QString &id);

    int unreadTotal() const { return m_total; }
    // Kept for the tray (mouseion/iris#67); nothing shows it yet.
    int unreadHighlight() const { return m_highlight; }

    // Native -> web colorScheme { dark }; remembered for latestEvents().
    void setColorScheme(bool dark);
    // Native -> web, not remembered: a notification was clicked / replied to.
    void openRoom(const QString &roomId, const QString &eventId);
    void reply(const QString &roomId, const QString &eventId, const QString &text);
    // Native -> web, a matrix: link (mouseion/iris#69), event `openLink`. A link is an occurrence
    // that must not be lost: it is queued until the page's adapter has asked for the pending links
    // (takePendingLinks), then emitted at once. At most maxPendingLinks wait; the oldest go.
    static constexpr int maxPendingLinks = 8;
    void openLink(const MatrixLink &link);
    // The adapter is up: hands over the queued links (JSON payloads, oldest first) and from now on
    // links are emitted as events.
    Q_INVOKABLE QStringList takePendingLinks();
    // A page is loading (possibly a reload): its adapter is not up until it asks again.
    void pageLoading();
    // The page (re)connected: say the current badge again and replay nothing else (the page asks
    // for latestEvents itself).
    void pageConnected();

Q_SIGNALS:
    // The badge count to show; also emitted again by pageConnected().
    void unreadChanged(int total, int highlight);
    // Native -> web. Delivered to handlers added with irisDesktop.on(name, handler); payload is JSON.
    // A checked request from the page; main wires these to the Notifier.
    void notifyRequested(const NotifyRequest &request);
    void closeNotificationsRequested(const QString &roomId);
    void eventEmitted(const QString &name, const QString &payload);

private:
    int m_total = 0;
    int m_highlight = 0;
    QHash<QString, QString> m_latest;
    QStringList m_pendingLinks;
    bool m_linksLive = false;
};

// Owns the QWebChannel and the bridge, and publishes the bridge only while the view is on the
// allowed origin.
class BridgeHost : public QObject
{
    Q_OBJECT
public:
    static constexpr const char *objectName_ = "irisDesktop";

    BridgeHost(NavigationPolicy *policy, QObject *parent = nullptr);

    QWebChannel *channel() const { return m_channel; }
    // Adopts the channel the view was given (QML creates its own); carries the bridge over.
    Q_INVOKABLE void useChannel(QObject *channel);
    IrisBridge *bridge() const { return m_bridge; }
    bool bridgeRegistered() const { return m_registered; }

    // The script injected into the page: qwebchannel.js and the adapter, wrapped so that it does
    // nothing off the allowed origin.
    QString injectedScript() const;

    // Called with every URL the view is about to show or has shown.
    Q_INVOKABLE void pageUrlChanged(const QUrl &url);
    // Called when the view starts loading a page (including a reload).
    Q_INVOKABLE void pageLoading();
    // Called when a page finished loading; if it is on the allowed origin the badge is sent again.
    Q_INVOKABLE void pageLoaded(const QUrl &url);

private:
    NavigationPolicy *m_policy;
    QWebChannel *m_channel;
    IrisBridge *m_bridge;
    bool m_registered = false;
};
