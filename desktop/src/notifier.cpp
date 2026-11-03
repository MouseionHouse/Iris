#include "notifier.h"

#include "shellconfig.h"

#include <KNotification>
#include <KNotificationReplyAction>

#include <QPixmap>

#include <memory>

Notifier::Notifier(QObject *parent)
    : QObject(parent)
{
}

void Notifier::notify(const NotifyRequest &r)
{
    // Closing emits `closed` at once, which edits m_byRoom: take the room's list out first and put
    // it back when done.
    QList<Shown> shown = m_byRoom.take(r.roomId);
    shown.removeIf([](const Shown &s) { return !s.notification; });
    // Same id: the later one takes the place of the earlier.
    for (qsizetype i = shown.size() - 1; i >= 0; --i) {
        if (shown.at(i).id == r.id)
            shown.takeAt(i).notification->close();
    }
    while (shown.size() >= maxPerRoom)
        shown.takeFirst().notification->close();

    auto *n = new KNotification(QString::fromLatin1(eventName));
    n->setComponentName(ShellConfig::appId);
    n->setTitle(r.title);
    // Plasma reads the body as a small subset of HTML; a message must not be able to use it.
    n->setText(r.body.toHtmlEscaped());
    n->setHint(QStringLiteral("category"), QStringLiteral("im.received"));
    if (!r.icon.isNull())
        n->setPixmap(QPixmap::fromImage(r.icon));
    else
        n->setIconName(QString(ShellConfig::iconName));

    const QString roomId = r.roomId;
    const QString eventId = r.eventId;

    KNotificationAction *open = n->addDefaultAction(tr("Open"));
    connect(open, &KNotificationAction::activated, this, [this, roomId, eventId] {
        Q_EMIT openRoomRequested(roomId, eventId);
    });

    if (r.canReply) {
        // Where the notification server has no inline reply, the action is left out
        // (FallbackBehavior::HideAction) and this is a plain notification.
        auto reply = std::make_unique<KNotificationReplyAction>(tr("Reply"));
        reply->setPlaceholderText(tr("Reply to %1").arg(r.title));
        reply->setSubmitButtonText(tr("Send"));
        reply->setFallbackBehavior(KNotificationReplyAction::FallbackBehavior::HideAction);
        connect(reply.get(), &KNotificationReplyAction::replied, this, [this, roomId, eventId](const QString &text) {
            Q_EMIT replyRequested(roomId, eventId, text);
        });
        n->setReplyAction(std::move(reply));
    }

    connect(n, &KNotification::closed, this, [this, roomId, n] { forget(roomId, n); });
    shown.append({r.id, n});
    m_byRoom.insert(r.roomId, shown);
    n->sendEvent();
}

void Notifier::forget(const QString &roomId, KNotification *notification)
{
    auto it = m_byRoom.find(roomId);
    if (it == m_byRoom.end())
        return;
    it->removeIf([notification](const Shown &s) { return !s.notification || s.notification == notification; });
    if (it->isEmpty())
        m_byRoom.erase(it);
}

void Notifier::closeRoom(const QString &roomId)
{
    const QList<Shown> shown = m_byRoom.take(roomId);
    for (const Shown &s : shown) {
        if (s.notification)
            s.notification->close();
    }
}

int Notifier::openCount(const QString &roomId) const
{
    int n = 0;
    for (const Shown &s : m_byRoom.value(roomId)) {
        if (s.notification)
            ++n;
    }
    return n;
}
