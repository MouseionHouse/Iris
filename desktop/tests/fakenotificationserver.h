#pragma once

// A stand-in for the desktop's notification server (org.freedesktop.Notifications) on the session
// bus: records what it is sent, and can answer the way Plasma does (clicks, inline replies, closes).
// Used by tst_notifier in-process and by fakenotifyd for the end-to-end script.

#include <QDBusConnection>
#include <QDBusMessage>
#include <QObject>
#include <QStringList>
#include <QVariantMap>

class FakeNotificationServer : public QObject
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.freedesktop.Notifications")
public:
    struct Call {
        uint id = 0;
        uint replacesId = 0;
        QString appName;
        QString appIcon;
        QString summary;
        QString body;
        QStringList actions; // key, label, key, label, ...
        QVariantMap hints;
        int expireTimeout = 0;
    };

    explicit FakeNotificationServer(bool inlineReply = true, QObject *parent = nullptr)
        : QObject(parent)
        , m_inlineReply(inlineReply)
    {
    }

    bool start()
    {
        auto bus = QDBusConnection::sessionBus();
        return bus.registerObject(QStringLiteral("/org/freedesktop/Notifications"), this, QDBusConnection::ExportAllSlots | QDBusConnection::ExportAllSignals)
            && bus.registerService(QStringLiteral("org.freedesktop.Notifications"));
    }

    QList<Call> calls;
    QList<uint> closeRequests; // ids the application asked to close

Q_SIGNALS:
    void NotificationClosed(uint id, uint reason);
    void ActionInvoked(uint id, const QString &actionKey);
    void NotificationReplied(uint id, const QString &text);
    void notified(); // test hook: a Notify call arrived

public Q_SLOTS:
    QStringList GetCapabilities()
    {
        QStringList caps{QStringLiteral("actions"), QStringLiteral("body"), QStringLiteral("body-markup"), QStringLiteral("icon-static")};
        if (m_inlineReply)
            caps << QStringLiteral("inline-reply");
        return caps;
    }

    uint Notify(const QString &appName, uint replacesId, const QString &appIcon, const QString &summary, const QString &body, const QStringList &actions, const QVariantMap &hints, int expireTimeout)
    {
        Call c;
        c.id = replacesId ? replacesId : ++m_lastId;
        c.replacesId = replacesId;
        c.appName = appName;
        c.appIcon = appIcon;
        c.summary = summary;
        c.body = body;
        c.actions = actions;
        c.hints = hints;
        c.expireTimeout = expireTimeout;
        calls.append(c);
        Q_EMIT notified();
        return c.id;
    }

    void CloseNotification(uint id)
    {
        closeRequests.append(id);
        Q_EMIT NotificationClosed(id, 3); // closed by a call to CloseNotification
    }

    QString GetServerInformation(QString &vendor, QString &version, QString &specVersion)
    {
        vendor = QStringLiteral("Iris tests");
        version = QStringLiteral("1");
        specVersion = QStringLiteral("1.2");
        return QStringLiteral("fake-notifyd");
    }

private:
    bool m_inlineReply;
    uint m_lastId = 0;
};
