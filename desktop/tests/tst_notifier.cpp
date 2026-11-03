#include "fakenotificationserver.h"
#include "notifier.h"

#include <QDir>
#include <QGuiApplication>
#include <QFile>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QTest>

// Needs a session bus (ctest runs it under dbus-run-session): the real KNotification talks to the
// fake server in this process.
class NotifierTest : public QObject
{
    Q_OBJECT
    QTemporaryDir m_dataDir;

    static NotifyRequest request(const QString &id, const QString &room, const QString &title = QStringLiteral("Kitchen"), bool canReply = true)
    {
        NotifyRequest r;
        r.id = id;
        r.roomId = room;
        r.eventId = QStringLiteral("$") + id;
        r.title = title;
        r.body = QStringLiteral("New inbox notification from Sam");
        r.canReply = canReply;
        return r;
    }

    // KNotification asks a new server for its capabilities, and learns the ids of its notifications,
    // asynchronously; give both a moment.
    static void settle() { QTest::qWait(300); }

private Q_SLOTS:
    void initTestCase()
    {
        QGuiApplication::setDesktopFileName(QStringLiteral("house.mouseion.iris")); // as main() does
        // KNotification finds the event in <XDG_DATA_DIRS>/knotifications6/house.mouseion.iris.notifyrc.
        QVERIFY(QFile::exists(QStringLiteral(IRIS_NOTIFYRC)));
        QVERIFY(m_dataDir.isValid());
        QVERIFY(QDir(m_dataDir.path()).mkpath(QStringLiteral("knotifications6")));
        QVERIFY(QFile::copy(QStringLiteral(IRIS_NOTIFYRC), m_dataDir.path() + QStringLiteral("/knotifications6/house.mouseion.iris.notifyrc")));
        qputenv("XDG_DATA_DIRS", m_dataDir.path().toUtf8());
    }

    void showsOnePopupPerCallWithTheRightContent()
    {
        FakeNotificationServer server(true);
        QVERIFY(server.start());
        Notifier notifier;
        NotifyRequest r = request(QStringLiteral("e1"), QStringLiteral("!k:x"));
        r.body = QStringLiteral("<b>hi</b> & bye");
        notifier.notify(r);
        QTRY_COMPARE(server.calls.size(), 1);
        const auto c = server.calls.constFirst();
        QCOMPARE(c.summary, QString("Kitchen"));
        QCOMPARE(c.body, QString("&lt;b&gt;hi&lt;/b&gt; &amp; bye")); // markup from a message is not interpreted
        // The component KDE looks the settings up by, and the event within it.
        QCOMPARE(c.hints.value("x-kde-appname").toString(), QString("house.mouseion.iris"));
        QCOMPARE(c.hints.value("x-kde-eventId").toString(), QString("message"));
        QCOMPARE(c.hints.value("desktop-entry").toString(), QString("house.mouseion.iris"));
        QVERIFY(c.actions.contains("default"));
        QCOMPARE(notifier.openCount("!k:x"), 1);
    }

    void replyActionOnlyWhenTheServerCanDoIt_data()
    {
        QTest::addColumn<bool>("serverHasInlineReply");
        QTest::addColumn<bool>("pageAllowsReply");
        QTest::addColumn<bool>("expectReply");
        QTest::newRow("both") << true << true << true;
        QTest::newRow("server without inline reply") << false << true << false;
        QTest::newRow("invitation") << true << false << false;
    }

    void replyActionOnlyWhenTheServerCanDoIt()
    {
        QFETCH(bool, serverHasInlineReply);
        QFETCH(bool, pageAllowsReply);
        QFETCH(bool, expectReply);
        // KNotification asks the server what it can do once per process, so the server without
        // inline reply is its own run (tst_notifier_plain_server).
        if (serverHasInlineReply == qEnvironmentVariableIsSet("IRIS_TEST_SERVER_WITHOUT_INLINE_REPLY"))
            QSKIP("belongs to the other run");
        FakeNotificationServer server(serverHasInlineReply);
        QVERIFY(server.start());
        settle();
        Notifier notifier;
        notifier.notify(request(QStringLiteral("e1"), QStringLiteral("!k:x"), QStringLiteral("Kitchen"), pageAllowsReply));
        QTRY_COMPARE(server.calls.size(), 1);
        const auto c = server.calls.constFirst();
        QCOMPARE(c.actions.contains("inline-reply"), expectReply);
        if (expectReply) {
            QCOMPARE(c.hints.value("x-kde-reply-placeholder-text").toString(), QString("Reply to Kitchen"));
        }
        QVERIFY(c.actions.contains("default")); // a click opens the room either way
    }

    void clickAndReplyAreForwardedWithTheirRoom()
    {
        FakeNotificationServer server(true);
        QVERIFY(server.start());
        Notifier notifier;
        QSignalSpy opened(&notifier, &Notifier::openRoomRequested);
        QSignalSpy replied(&notifier, &Notifier::replyRequested);
        notifier.notify(request(QStringLiteral("e1"), QStringLiteral("!k:x")));
        QTRY_COMPARE(server.calls.size(), 1);
        const uint id = server.calls.constFirst().id;
        Q_EMIT server.ActionInvoked(id, QStringLiteral("default"));
        QTRY_COMPARE(opened.count(), 1);
        QCOMPARE(opened.constFirst(), (QVariantList{"!k:x", "$e1"}));

        notifier.notify(request(QStringLiteral("e2"), QStringLiteral("!k:x")));
        QTRY_COMPARE(server.calls.size(), 2);
        Q_EMIT server.NotificationReplied(server.calls.constLast().id, QStringLiteral("on my way"));
        QTRY_COMPARE(replied.count(), 1);
        QCOMPARE(replied.constFirst(), (QVariantList{"!k:x", "$e2", "on my way"}));
    }

    void groupsPerRoomAndClosesOnlyThatRoom()
    {
        FakeNotificationServer server(true);
        QVERIFY(server.start());
        Notifier notifier;
        notifier.notify(request(QStringLiteral("a1"), QStringLiteral("!a:x")));
        notifier.notify(request(QStringLiteral("a2"), QStringLiteral("!a:x")));
        notifier.notify(request(QStringLiteral("b1"), QStringLiteral("!b:x")));
        QTRY_COMPARE(server.calls.size(), 3);
        settle();
        QCOMPARE(notifier.openCount("!a:x"), 2);
        QCOMPARE(notifier.openCount("!b:x"), 1);
        const uint a1 = server.calls.at(0).id, a2 = server.calls.at(1).id, b1 = server.calls.at(2).id;

        notifier.closeRoom(QStringLiteral("!a:x"));
        QTRY_COMPARE(server.closeRequests.size(), 2);
        QVERIFY(server.closeRequests.contains(a1));
        QVERIFY(server.closeRequests.contains(a2));
        QVERIFY(!server.closeRequests.contains(b1));
        QCOMPARE(notifier.openCount("!a:x"), 0);
        QCOMPARE(notifier.openCount("!b:x"), 1);

        notifier.closeRoom(QStringLiteral("!unknown:x")); // nothing to do, no crash
        QCOMPARE(server.closeRequests.size(), 2);
    }

    void aNotificationClosedByTheUserIsForgotten()
    {
        FakeNotificationServer server(true);
        QVERIFY(server.start());
        Notifier notifier;
        notifier.notify(request(QStringLiteral("a1"), QStringLiteral("!a:x")));
        QTRY_COMPARE(server.calls.size(), 1);
        Q_EMIT server.NotificationClosed(server.calls.constFirst().id, 2); // dismissed
        QTRY_COMPARE(notifier.openCount("!a:x"), 0);
    }

    void theSameIdReplacesAndTheRoomIsCapped()
    {
        FakeNotificationServer server(true);
        QVERIFY(server.start());
        Notifier notifier;
        notifier.notify(request(QStringLiteral("same"), QStringLiteral("!a:x")));
        notifier.notify(request(QStringLiteral("same"), QStringLiteral("!a:x")));
        QCOMPARE(notifier.openCount("!a:x"), 1);
        for (int i = 0; i < Notifier::maxPerRoom + 3; ++i)
            notifier.notify(request(QStringLiteral("m%1").arg(i), QStringLiteral("!a:x")));
        QCOMPARE(notifier.openCount("!a:x"), Notifier::maxPerRoom);
        notifier.closeRoom(QStringLiteral("!a:x"));
    }

};

QTEST_MAIN(NotifierTest)
#include "tst_notifier.moc"
