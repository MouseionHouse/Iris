#include "matrixuri.h"

#include "irisbridge.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QDebug>
#include <QRegularExpression>

#include <optional>

namespace
{
std::nullopt_t fail(QString *error, const char *why)
{
    if (error)
        *error = QString::fromLatin1(why);
    return std::nullopt;
}

int hexValue(QChar c)
{
    const char16_t u = c.unicode();
    if (u >= u'0' && u <= u'9')
        return u - u'0';
    if (u >= u'a' && u <= u'f')
        return u - u'a' + 10;
    if (u >= u'A' && u <= u'F')
        return u - u'A' + 10;
    return -1;
}

// Percent-decoding that refuses what it cannot make sense of: a stray `%`, raw bytes outside
// printable ASCII, a result that is not UTF-8, or one with control, format (bidi overrides,
// zero-width joiners), separator or non-characters in it.
bool decodeComponent(QStringView raw, QString *out)
{
    QByteArray bytes;
    bytes.reserve(raw.size());
    for (qsizetype i = 0; i < raw.size(); ++i) {
        const QChar c = raw.at(i);
        if (c == QLatin1Char('%')) {
            if (i + 2 >= raw.size())
                return false;
            const int hi = hexValue(raw.at(i + 1));
            const int lo = hexValue(raw.at(i + 2));
            if (hi < 0 || lo < 0)
                return false;
            bytes.append(char(hi * 16 + lo));
            i += 2;
        } else if (c.unicode() > 0x20 && c.unicode() < 0x7f) {
            bytes.append(char(c.unicode()));
        } else {
            return false;
        }
    }
    if (!QByteArrayView(bytes).isValidUtf8())
        return false;
    const QString s = QString::fromUtf8(bytes);
    for (char32_t cp : s.toUcs4()) {
        switch (QChar::category(cp)) {
        case QChar::Other_Control:
        case QChar::Other_Format:
        case QChar::Other_Surrogate:
        case QChar::Other_PrivateUse:
        case QChar::Separator_Line:
        case QChar::Separator_Paragraph:
        case QChar::Separator_Space:
            return false;
        default:
            break;
        }
        if (QChar::isNonCharacter(cp))
            return false;
    }
    *out = s;
    return true;
}

bool validLocalPart(const QString &local, bool alias)
{
    if (local.isEmpty())
        return false;
    if (!alias) {
        static const QRegularExpression re(QStringLiteral("\\A[A-Za-z0-9._=\\-/+]+\\z"));
        return re.match(local).hasMatch();
    }
    // An alias may be any printable text, bar the sigils and the separator.
    for (const QChar c : local) {
        if (c.isSpace() || QStringLiteral("#@!$:").contains(c))
            return false;
    }
    return true;
}

// `<sigil><local>:<server>`, ≤ 255 bytes, for aliases and users.
bool validMxid(const QString &id, QChar sigil, bool alias)
{
    if (id.size() < 4 || id.at(0) != sigil || id.toUtf8().size() > 255)
        return false;
    const qsizetype colon = id.indexOf(QLatin1Char(':'));
    return colon > 1 && validLocalPart(id.mid(1, colon - 1), alias) && validMatrixServerName(id.mid(colon + 1));
}
} // namespace

bool validMatrixServerName(const QString &name)
{
    static const QRegularExpression re(QStringLiteral("\\A(\\[[0-9A-Fa-f:.]{2,45}\\]|[A-Za-z0-9][A-Za-z0-9.\\-]*)(?::([0-9]{1,5}))?\\z"));
    if (name.size() > 255)
        return false;
    const auto m = re.match(name);
    if (!m.hasMatch())
        return false;
    return m.captured(2).isEmpty() || m.captured(2).toInt() <= 65535;
}

std::optional<MatrixLink> parseMatrixUri(const QString &uri, QString *error)
{
    static const QString scheme = QStringLiteral("matrix:");
    if (uri.size() > maxMatrixUriLength)
        return fail(error, "too long");
    if (!uri.startsWith(scheme, Qt::CaseInsensitive))
        return fail(error, "not a matrix: URI");
    QStringView rest = QStringView(uri).mid(scheme.size());
    if (rest.contains(QLatin1Char('#')))
        return fail(error, "a fragment has no meaning in a matrix: URI");
    if (rest.startsWith(QLatin1Char('/')))
        return fail(error, "no authority or absolute path in a matrix: URI");

    QStringView path = rest;
    QStringView query;
    const qsizetype q = rest.indexOf(QLatin1Char('?'));
    if (q >= 0) {
        path = rest.left(q);
        query = rest.mid(q + 1);
    }
    if (path.isEmpty())
        return fail(error, "empty path");

    QList<QString> segments;
    for (const QStringView part : path.split(QLatin1Char('/'), Qt::KeepEmptyParts)) {
        QString decoded;
        if (part.isEmpty())
            return fail(error, "empty path segment");
        if (!decodeComponent(part, &decoded))
            return fail(error, "bad percent-encoding or characters in the path");
        segments.append(decoded);
    }

    MatrixLink link;
    const QString &kind = segments.first();
    if (kind == QLatin1String("roomid") || kind == QLatin1String("r")) {
        link.kind = kind == QLatin1String("r") ? MatrixLink::Kind::Alias : MatrixLink::Kind::Room;
        if (segments.size() != 2 && segments.size() != 4)
            return fail(error, "a room link is <kind>/<id>[/e/<event>]");
        link.id = (link.kind == MatrixLink::Kind::Room ? QStringLiteral("!") : QStringLiteral("#")) + segments.at(1);
        if (link.kind == MatrixLink::Kind::Room ? !IrisBridge::validRoomId(link.id) : !validMxid(link.id, QLatin1Char('#'), true))
            return fail(error, "not a valid room ID or alias");
        if (segments.size() == 4) {
            if (segments.at(2) != QLatin1String("e"))
                return fail(error, "only /e/<event> may follow a room");
            link.eventId = QStringLiteral("$") + segments.at(3);
            if (!IrisBridge::validEventId(link.eventId))
                return fail(error, "not a valid event ID");
        }
    } else if (kind == QLatin1String("u")) {
        link.kind = MatrixLink::Kind::User;
        if (segments.size() != 2)
            return fail(error, "a user link is u/<user>");
        link.id = QStringLiteral("@") + segments.at(1);
        if (!validMxid(link.id, QLatin1Char('@'), false))
            return fail(error, "not a valid user ID");
    } else {
        return fail(error, "unknown kind");
    }

    bool haveAction = false;
    if (!query.isEmpty()) {
        for (const QStringView param : query.split(QLatin1Char('&'), Qt::SkipEmptyParts)) {
            const qsizetype eq = param.indexOf(QLatin1Char('='));
            QString key;
            QString value;
            if (!decodeComponent(eq < 0 ? param : param.left(eq), &key) || (eq >= 0 && !param.mid(eq + 1).isEmpty() && !decodeComponent(param.mid(eq + 1), &value)))
                return fail(error, "bad percent-encoding or characters in the query");
            if (key == QLatin1String("via")) {
                if (!validMatrixServerName(value))
                    return fail(error, "bad via server");
                if (!link.via.contains(value)) {
                    if (link.via.size() >= maxMatrixUriVia)
                        return fail(error, "too many via servers");
                    link.via.append(value);
                }
            } else if (key == QLatin1String("action")) {
                if (haveAction)
                    return fail(error, "action given twice");
                haveAction = true;
                if (value == QLatin1String("join"))
                    link.action = MatrixLink::Action::Join;
                else if (value == QLatin1String("chat"))
                    link.action = MatrixLink::Action::Chat;
                else
                    return fail(error, "unknown action");
            }
            // Anything else: ignored, never forwarded.
        }
    }
    if (link.kind == MatrixLink::Kind::User && (link.action == MatrixLink::Action::Join || !link.via.isEmpty()))
        return fail(error, "a user link takes only action=chat");
    return link;
}

QList<MatrixLink> matrixLinksFromArguments(const QStringList &arguments)
{
    QList<MatrixLink> links;
    int seen = 0;
    for (const QString &arg : arguments) {
        if (arg.startsWith(QLatin1Char('-')))
            continue; // an option, not a link
        if (++seen > maxMatrixLinksPerLaunch) {
            qWarning() << "Dropped matrix: link (too many arguments):" << arg.left(200);
            continue;
        }
        QString why;
        if (const auto link = parseMatrixUri(arg, &why))
            links.append(*link);
        else
            qWarning() << "Dropped matrix: link" << arg.left(200) << "-" << why; // QDebug quotes and escapes it
    }
    return links;
}

QString MatrixLink::toJson() const
{
    static const char *kinds[] = {"room", "alias", "user"};
    QJsonObject o{{QStringLiteral("kind"), QString::fromLatin1(kinds[int(kind)])}, {QStringLiteral("id"), id}};
    if (!eventId.isEmpty())
        o.insert(QStringLiteral("eventId"), eventId);
    if (!via.isEmpty())
        o.insert(QStringLiteral("via"), QJsonArray::fromStringList(via));
    if (action != Action::None)
        o.insert(QStringLiteral("action"), action == Action::Join ? QStringLiteral("join") : QStringLiteral("chat"));
    return QString::fromUtf8(QJsonDocument(o).toJson(QJsonDocument::Compact));
}
