#include "irisbridge.h"

#include "navigationpolicy.h"

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QWebChannel>

#include <cmath>

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

// A non-negative whole number that fits an int, as the page can only send JSON numbers.
static bool wholeNumber(const QVariant &v, int max, int *out)
{
    switch (v.typeId()) {
    case QMetaType::Int:
    case QMetaType::UInt:
    case QMetaType::LongLong:
    case QMetaType::ULongLong:
    case QMetaType::Double:
        break;
    default:
        return false;
    }
    const double d = v.toDouble();
    if (!std::isfinite(d) || d < 0 || d > max || d != std::floor(d))
        return false;
    *out = int(d);
    return true;
}

bool IrisBridge::setUnread(const QVariantMap &counts)
{
    int total = 0;
    int highlight = 0;
    if (counts.size() != 2 || !wholeNumber(counts.value(QStringLiteral("total")), maxUnread, &total)
        || !wholeNumber(counts.value(QStringLiteral("highlight")), maxUnread, &highlight) || highlight > total)
        return false;
    if (total != m_total || highlight != m_highlight) {
        m_total = total;
        m_highlight = highlight;
        Q_EMIT unreadChanged(total, highlight);
    }
    return true;
}

QString IrisBridge::latestEvents() const
{
    QJsonObject o;
    for (auto it = m_latest.cbegin(); it != m_latest.cend(); ++it)
        o.insert(it.key(), it.value());
    return QString::fromUtf8(QJsonDocument(o).toJson(QJsonDocument::Compact));
}

void IrisBridge::setColorScheme(bool dark)
{
    const QString payload = QString::fromUtf8(QJsonDocument(QJsonObject{{QStringLiteral("dark"), dark}}).toJson(QJsonDocument::Compact));
    m_latest.insert(QStringLiteral("colorScheme"), payload);
    Q_EMIT eventEmitted(QStringLiteral("colorScheme"), payload);
}

void IrisBridge::pageConnected()
{
    Q_EMIT unreadChanged(m_total, m_highlight);
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

void BridgeHost::pageLoaded(const QUrl &url)
{
    if (m_policy->bridgeOffered(url))
        m_bridge->pageConnected();
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
