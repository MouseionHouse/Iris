#pragma once

#include <QObject>
#include <QString>
#include <QUrl>

class NavigationPolicy;
class QWebChannel;

// What the page can call: window.irisDesktop. Later tickets add the methods from the contract in
// mouseion/iris#63; this one has version() only.
class IrisBridge : public QObject
{
    Q_OBJECT
public:
    explicit IrisBridge(QObject *parent = nullptr);

    Q_INVOKABLE QString version() const;

Q_SIGNALS:
    // Native -> web. Delivered to handlers added with irisDesktop.on(name, handler); payload is JSON.
    void eventEmitted(const QString &name, const QString &payload);
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
    IrisBridge *bridge() const { return m_bridge; }
    bool bridgeRegistered() const { return m_registered; }

    // The script injected into the page: qwebchannel.js and the adapter, wrapped so that it does
    // nothing off the allowed origin.
    QString injectedScript() const;

    // Called with every URL the view is about to show or has shown.
    Q_INVOKABLE void pageUrlChanged(const QUrl &url);

private:
    NavigationPolicy *m_policy;
    QWebChannel *m_channel;
    IrisBridge *m_bridge;
    bool m_registered = false;
};
