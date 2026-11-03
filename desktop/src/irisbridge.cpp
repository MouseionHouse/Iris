#include "irisbridge.h"

#include "navigationpolicy.h"

#include <QBuffer>
#include <QFile>
#include <QImageReader>
#include <QRegularExpression>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QWebChannel>

#include <algorithm>
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

// Surrogates are fine in valid pairs; QString::toUtf8 turns lone ones into U+FFFD, so refuse them.
static bool hasLoneSurrogate(const QString &s)
{
    for (qsizetype i = 0; i < s.size(); ++i) {
        const QChar c = s.at(i);
        if (c.isHighSurrogate() && i + 1 < s.size() && s.at(i + 1).isLowSurrogate())
            ++i;
        else if (c.isSurrogate())
            return true;
    }
    return false;
}

static bool plainText(const QVariant &v, int minLength, int maxLength, bool allowNewlines, QString *out)
{
    if (v.typeId() != QMetaType::QString)
        return false;
    const QString s = v.toString();
    if (s.size() < minLength || s.size() > maxLength || hasLoneSurrogate(s))
        return false;
    // A surrogate pair is two Other_Surrogate code units to QChar; check the code points instead.
    const auto ucs4 = s.toUcs4();
    if (std::any_of(ucs4.cbegin(), ucs4.cend(), [allowNewlines](char32_t c) {
            if (allowNewlines && (c == U'\n' || c == U'\t'))
                return false;
            return QChar::category(c) == QChar::Other_Control || QChar::isNonCharacter(c);
        }))
        return false;
    *out = s;
    return true;
}

static const QRegularExpression &opaqueId()
{
    static const QRegularExpression re(QStringLiteral("\\A[A-Za-z0-9._~+=/\\-]{1,200}(:[A-Za-z0-9.\\-]{1,200}(:[0-9]{1,5})?)?\\z"));
    return re;
}

bool IrisBridge::validRoomId(const QString &id)
{
    return id.size() <= maxIdLength && id.startsWith(QLatin1Char('!')) && opaqueId().match(id.mid(1)).hasMatch();
}

bool IrisBridge::validEventId(const QString &id)
{
    return id.size() <= maxIdLength && id.startsWith(QLatin1Char('$')) && opaqueId().match(id.mid(1)).hasMatch();
}

// A PNG or JPEG data URL, small in bytes and in pixels, decoded to an image. Nothing else is read.
static bool iconFromDataUrl(const QVariant &v, QImage *out)
{
    if (v.typeId() != QMetaType::QString)
        return false;
    const QString url = v.toString();
    static const QString png = QStringLiteral("data:image/png;base64,");
    static const QString jpeg = QStringLiteral("data:image/jpeg;base64,");
    const QString *prefix = url.startsWith(png) ? &png : url.startsWith(jpeg) ? &jpeg : nullptr;
    // The encoded text is 4/3 of the bytes.
    if (!prefix || url.size() - prefix->size() > IrisBridge::maxIconBytes / 3 * 4 + 4)
        return false;
    const auto decoded = QByteArray::fromBase64Encoding(url.mid(prefix->size()).toLatin1(), QByteArray::Base64Encoding | QByteArray::AbortOnBase64DecodingErrors);
    if (!decoded || decoded.decoded.isEmpty() || decoded.decoded.size() > IrisBridge::maxIconBytes)
        return false;
    QByteArray bytes = decoded.decoded;
    QBuffer buffer(&bytes);
    buffer.open(QIODevice::ReadOnly);
    QImageReader reader(&buffer, prefix == &png ? "png" : "jpeg");
    const QSize size = reader.size();
    if (!size.isValid() || size.width() > IrisBridge::maxIconPixels || size.height() > IrisBridge::maxIconPixels)
        return false;
    QImage image = reader.read();
    if (image.isNull())
        return false;
    *out = image;
    return true;
}

bool IrisBridge::notify(const QVariantMap &n)
{
    static const QStringList allowed{QStringLiteral("id"), QStringLiteral("roomId"), QStringLiteral("eventId"), QStringLiteral("title"), QStringLiteral("body"), QStringLiteral("icon"), QStringLiteral("canReply")};
    for (auto it = n.cbegin(); it != n.cend(); ++it) {
        if (!allowed.contains(it.key()))
            return false;
    }
    NotifyRequest r;
    if (!plainText(n.value(QStringLiteral("id")), 1, maxIdLength, false, &r.id) || !plainText(n.value(QStringLiteral("roomId")), 1, maxIdLength, false, &r.roomId) || !validRoomId(r.roomId)
        || !plainText(n.value(QStringLiteral("title")), 1, maxTitleLength, false, &r.title) || !plainText(n.value(QStringLiteral("body")), 0, maxBodyLength, true, &r.body))
        return false;
    if (n.contains(QStringLiteral("eventId")) && (!plainText(n.value(QStringLiteral("eventId")), 1, maxIdLength, false, &r.eventId) || !validEventId(r.eventId)))
        return false;
    if (n.contains(QStringLiteral("icon")) && !iconFromDataUrl(n.value(QStringLiteral("icon")), &r.icon))
        return false;
    if (n.contains(QStringLiteral("canReply"))) {
        if (n.value(QStringLiteral("canReply")).typeId() != QMetaType::Bool)
            return false;
        r.canReply = n.value(QStringLiteral("canReply")).toBool();
    }
    Q_EMIT notifyRequested(r);
    return true;
}

bool IrisBridge::closeNotifications(const QVariantMap &target)
{
    QString roomId;
    if (target.size() != 1 || !plainText(target.value(QStringLiteral("roomId")), 1, maxIdLength, false, &roomId) || !validRoomId(roomId))
        return false;
    Q_EMIT closeNotificationsRequested(roomId);
    return true;
}

static QString json(const QJsonObject &o)
{
    return QString::fromUtf8(QJsonDocument(o).toJson(QJsonDocument::Compact));
}

void IrisBridge::openRoom(const QString &roomId, const QString &eventId)
{
    QJsonObject o{{QStringLiteral("roomId"), roomId}};
    if (!eventId.isEmpty())
        o.insert(QStringLiteral("eventId"), eventId);
    Q_EMIT eventEmitted(QStringLiteral("openRoom"), json(o));
}

void IrisBridge::reply(const QString &roomId, const QString &eventId, const QString &text)
{
    QJsonObject o{{QStringLiteral("roomId"), roomId}, {QStringLiteral("text"), text.left(maxReplyLength)}};
    if (!eventId.isEmpty())
        o.insert(QStringLiteral("eventId"), eventId);
    Q_EMIT eventEmitted(QStringLiteral("reply"), json(o));
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
