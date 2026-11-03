#include "irisbridge.h"

#include "navigationpolicy.h"

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QWebChannel>

#ifndef IRIS_SHELL_VERSION
#define IRIS_SHELL_VERSION "0.0.0"
#endif

static void initResources()
{
    // Resources in a static library are not linked in unless something names them.
    Q_INIT_RESOURCE(iris_assets);
}

IrisBridge::IrisBridge(QObject *parent)
    : QObject(parent)
{
}

QString IrisBridge::version() const
{
    return QStringLiteral(IRIS_SHELL_VERSION);
}

BridgeHost::BridgeHost(NavigationPolicy *policy, QObject *parent)
    : QObject(parent)
    , m_policy(policy)
    , m_channel(new QWebChannel(this))
    , m_bridge(new IrisBridge(this))
{
}

void BridgeHost::useChannel(QObject *channel)
{
    auto *next = qobject_cast<QWebChannel *>(channel);
    if (!next || next == m_channel)
        return;
    if (m_registered)
        m_channel->deregisterObject(m_bridge);
    m_channel = next;
    if (m_registered)
        m_channel->registerObject(QString::fromLatin1(objectName_), m_bridge);
}

void BridgeHost::pageUrlChanged(const QUrl &url)
{
    const bool offer = m_policy->bridgeOffered(url);
    if (offer == m_registered)
        return;
    if (offer)
        m_channel->registerObject(QString::fromLatin1(objectName_), m_bridge);
    else
        m_channel->deregisterObject(m_bridge);
    m_registered = offer;
}

QString BridgeHost::injectedScript() const
{
    initResources();
    QFile transport(QStringLiteral(":/qtwebchannel/qwebchannel.js"));
    if (!transport.open(QIODevice::ReadOnly)) qWarning("qwebchannel.js missing");
    QFile adapter(QStringLiteral(":/iris/bridge-adapter.js"));
    if (!adapter.open(QIODevice::ReadOnly)) qWarning("bridge adapter missing");
    const QString origin = QString::fromUtf8(QJsonDocument(QJsonArray{m_policy->allowedOrigin()}).toJson(QJsonDocument::Compact));
    // The guard is the first thing that runs; off the allowed origin the page gets neither
    // QWebChannel nor irisDesktop.
    return QStringLiteral("(function () {\nif (location.origin !== %1[0]) return;\n%2\n%3\n})();")
        .arg(origin, QString::fromUtf8(transport.readAll()), QString::fromUtf8(adapter.readAll()));
}
