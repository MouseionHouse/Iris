#pragma once

#include <QList>
#include <QString>
#include <QStringList>

#include <optional>

// A `matrix:` URI (Matrix spec, "Matrix URI scheme"), reduced to what the page needs. Identifiers
// carry their sigil (`!room:server`, `#alias:server`, `@user:server`; event IDs `$…`), exactly as
// the page's own `matrix.to` handling sees them.
struct MatrixLink {
    enum class Kind { Room, Alias, User };
    enum class Action { None, Join, Chat };

    Kind kind = Kind::Room;
    QString id;
    QString eventId; // Room and Alias only
    QStringList via; // server names, in order, without repeats
    Action action = Action::None;

    // The payload of the `openLink` event: { kind: "room"|"alias"|"user", id, eventId?, via?, action? }.
    QString toJson() const;
};

// Limits; anything over is refused, not cut.
constexpr int maxMatrixUriLength = 2048;
constexpr int maxMatrixUriVia = 10;

// Strict: the shapes the spec defines and nothing else.
//   matrix:roomid/<id>[/e/<event>][?via=<server>&…][&action=join|chat]
//   matrix:r/<alias>[/e/<event>][?…]
//   matrix:u/<user>[?action=chat]
// ASCII only (anything else must be percent-encoded, and must decode to valid UTF-8 without
// control characters); no authority, no fragment, no empty or extra path segments. Query keys other
// than `via` and `action` are ignored (the spec leaves room for more) and never passed on; a bad
// value for `via` or `action` refuses the whole link. On failure returns nothing and says why in
// `*error`.
std::optional<MatrixLink> parseMatrixUri(const QString &uri, QString *error = nullptr);

// The links among command-line arguments (options, which start with `-`, are skipped): each
// argument is parsed, and one that does not parse is logged and dropped. At most
// `maxMatrixLinksPerLaunch` arguments are looked at.
constexpr int maxMatrixLinksPerLaunch = 4;
QList<MatrixLink> matrixLinksFromArguments(const QStringList &arguments);

// Syntax checks the parser applies to the decoded identifiers (also useful to a test).
bool validMatrixServerName(const QString &name);
