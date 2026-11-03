#pragma once

#include <QHash>
#include <QImage>
#include <QList>
#include <QMetaType>
#include <QObject>
#include <QPointer>
#include <QString>

class KNotification;

// One notification as the page asked for it, already checked by IrisBridge.
struct NotifyRequest {
    QString id;
    QString roomId;
    QString eventId; // empty: not about one event
    QString title;
    QString body; // plain text
    QImage icon; // null: the Iris icon
    bool canReply = true;
};
Q_DECLARE_METATYPE(NotifyRequest)

// Shows the notifications through KDE (KNotification, event "message" of house.mouseion.iris.notifyrc,
// so System Settings lists Iris and Do Not Disturb applies) and keeps track of them per room.
class Notifier : public QObject
{
    Q_OBJECT
public:
    // The notifyrc's component, and its one event.
    static constexpr const char *eventName = "message";
    // At most this many notifications of one room stay up; the oldest is closed for the next.
    static constexpr int maxPerRoom = 5;

    explicit Notifier(QObject *parent = nullptr);

    // Shows it. The same id as one still up replaces that one.
    void notify(const NotifyRequest &request);
    // Closes every notification of the room (it was read).
    void closeRoom(const QString &roomId);
    // How many notifications of the room are up.
    int openCount(const QString &roomId) const;

Q_SIGNALS:
    // The default action (a click on the popup): the window should come forward, showing the room.
    void openRoomRequested(const QString &roomId, const QString &eventId);
    // Text typed into the popup's inline reply.
    void replyRequested(const QString &roomId, const QString &eventId, const QString &text);

private:
    struct Shown {
        QString id;
        QPointer<KNotification> notification;
    };
    void forget(const QString &roomId, KNotification *notification);

    QHash<QString, QList<Shown>> m_byRoom;
};
