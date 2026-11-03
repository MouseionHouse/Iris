#pragma once

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
    // The latest value of each sticky event ({ name: payload }, as JSON), so a handler added after
    // the event was emitted still learns the current state.
    Q_INVOKABLE QString latestEvents() const;

    int unreadTotal() const { return m_total; }
    // Kept for the tray (mouseion/iris#67); nothing shows it yet.
    int unreadHighlight() const { return m_highlight; }

    // Native -> web colorScheme { dark }; remembered for latestEvents().
    void setColorScheme(bool dark);
    // The page (re)connected: say the current badge again and replay nothing else (the page asks
    // for latestEvents itself).
    void pageConnected();

Q_SIGNALS:
    // The badge count to show; also emitted again by pageConnected().
    void unreadChanged(int total, int highlight);
    // Native -> web. Delivered to handlers added with irisDesktop.on(name, handler); payload is JSON.
    void eventEmitted(const QString &name, const QString &payload);

private:
    int m_total = 0;
    int m_highlight = 0;
    QHash<QString, QString> m_latest;
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
    // Called when a page finished loading; if it is on the allowed origin the badge is sent again.
    Q_INVOKABLE void pageLoaded(const QUrl &url);

private:
    NavigationPolicy *m_policy;
    QWebChannel *m_channel;
    IrisBridge *m_bridge;
    bool m_registered = false;
};
