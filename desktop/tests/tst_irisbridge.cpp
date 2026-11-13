#include "irisbridge.h"
#include "navigationpolicy.h"

#include <QBuffer>
#include <QImage>
#include <QRandomGenerator>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSignalSpy>
#include <QTest>
#include <QWebChannel>

// The origin these tests check, whatever IRIS_URL the shell is built with.
static const QString testOrigin{"https://iris.example.org"};

class IrisBridgeTest : public QObject
{
    Q_OBJECT
private Q_SLOTS:
    void versionIsTheShellVersion()
    {
        IrisBridge bridge;
        QCOMPARE(bridge.version(), QString(IRIS_SHELL_VERSION));
        QVERIFY(!bridge.version().isEmpty());
    }

    void setUnreadAcceptsCounts()
    {
        IrisBridge bridge;
        QSignalSpy spy(&bridge, &IrisBridge::unreadChanged);
        QVERIFY(bridge.setUnread({{"total", 7}, {"highlight", 2}}));
        QCOMPARE(bridge.unreadTotal(), 7);
        QCOMPARE(bridge.unreadHighlight(), 2);
        QCOMPARE(spy.count(), 1);
        QCOMPARE(spy.last(), (QVariantList{7, 2}));
        // JSON numbers reach C++ as doubles.
        QVERIFY(bridge.setUnread({{"total", 9.0}, {"highlight", 0.0}}));
        QCOMPARE(bridge.unreadTotal(), 9);
        // The same counts again are not news.
        QVERIFY(bridge.setUnread({{"total", 9}, {"highlight", 0}}));
        QCOMPARE(spy.count(), 2);
        QVERIFY(bridge.setUnread({{"total", 0}, {"highlight", 0}}));
        QCOMPARE(spy.last(), (QVariantList{0, 0}));
        QVERIFY(bridge.setUnread({{"total", IrisBridge::maxUnread}, {"highlight", IrisBridge::maxUnread}}));
    }

    void setUnreadRefusesBadArguments_data()
    {
        QTest::addColumn<QVariantMap>("args");
        QTest::newRow("empty") << QVariantMap{};
        QTest::newRow("no highlight") << QVariantMap{{"total", 1}};
        QTest::newRow("no total") << QVariantMap{{"highlight", 1}};
        QTest::newRow("extra key") << QVariantMap{{"total", 1}, {"highlight", 0}, {"x", 1}};
        QTest::newRow("string") << QVariantMap{{"total", "3"}, {"highlight", 0}};
        QTest::newRow("bool") << QVariantMap{{"total", true}, {"highlight", 0}};
        QTest::newRow("null") << QVariantMap{{"total", QVariant()}, {"highlight", 0}};
        QTest::newRow("negative") << QVariantMap{{"total", -1}, {"highlight", 0}};
        QTest::newRow("fraction") << QVariantMap{{"total", 1.5}, {"highlight", 0}};
        QTest::newRow("nan") << QVariantMap{{"total", qQNaN()}, {"highlight", 0}};
        QTest::newRow("infinity") << QVariantMap{{"total", qInf()}, {"highlight", 0}};
        QTest::newRow("too big") << QVariantMap{{"total", IrisBridge::maxUnread + 1}, {"highlight", 0}};
        QTest::newRow("highlight above total") << QVariantMap{{"total", 1}, {"highlight", 2}};
    }

    void setUnreadRefusesBadArguments()
    {
        QFETCH(QVariantMap, args);
        IrisBridge bridge;
        QVERIFY(bridge.setUnread({{"total", 4}, {"highlight", 1}}));
        QSignalSpy spy(&bridge, &IrisBridge::unreadChanged);
        QVERIFY(!bridge.setUnread(args));
        QCOMPARE(spy.count(), 0);
        QCOMPARE(bridge.unreadTotal(), 4);
        QCOMPARE(bridge.unreadHighlight(), 1);
    }

    void colorSchemeIsEmittedAndRemembered()
    {
        IrisBridge bridge;
        QVERIFY(QJsonDocument::fromJson(bridge.latestEvents().toUtf8()).object().isEmpty());
        QSignalSpy spy(&bridge, &IrisBridge::eventEmitted);
        bridge.setColorScheme(true);
        QCOMPARE(spy.count(), 1);
        QCOMPARE(spy.last().at(0).toString(), QString("colorScheme"));
        QCOMPARE(spy.last().at(1).toString(), QString("{\"dark\":true}"));
        bridge.setColorScheme(false);
        const auto latest = QJsonDocument::fromJson(bridge.latestEvents().toUtf8()).object();
        QCOMPARE(latest.value("colorScheme").toString(), QString("{\"dark\":false}"));
    }

    void pageConnectedSendsTheBadgeAgain()
    {
        IrisBridge bridge;
        QVERIFY(bridge.setUnread({{"total", 3}, {"highlight", 1}}));
        QSignalSpy spy(&bridge, &IrisBridge::unreadChanged);
        bridge.pageConnected();
        QCOMPARE(spy.count(), 1);
        QCOMPARE(spy.last(), (QVariantList{3, 1}));
    }

    void pageLoadedResendsOnlyOnTheAllowedOrigin()
    {
        NavigationPolicy policy{testOrigin};
        BridgeHost host(&policy);
        QVERIFY(host.bridge()->setUnread({{"total", 3}, {"highlight", 1}}));
        QSignalSpy spy(host.bridge(), &IrisBridge::unreadChanged);
        host.pageLoaded(QUrl("https://example.com/"));
        QCOMPARE(spy.count(), 0);
        host.pageLoaded(QUrl("https://iris.example.org/"));
        QCOMPARE(spy.count(), 1);
    }

    // --- notify / closeNotifications ---------------------------------------------------------

    static QString dataUrl(const QImage &image, const char *format = "PNG", const char *mime = "image/png")
    {
        QByteArray bytes;
        QBuffer buffer(&bytes);
        buffer.open(QIODevice::WriteOnly);
        image.save(&buffer, format);
        return QStringLiteral("data:%1;base64,").arg(QLatin1String(mime)) + QString::fromLatin1(bytes.toBase64());
    }

    static QVariantMap goodNotification()
    {
        return {{"id", "$e1"}, {"roomId", "!room:example.org"}, {"eventId", "$e1"}, {"title", "Kitchen"}, {"body", "New inbox notification from Sam"}};
    }

    void matrixIdsHaveTheRightShape_data()
    {
        QTest::addColumn<QString>("id");
        QTest::addColumn<bool>("room");
        QTest::addColumn<bool>("event");
        QTest::newRow("room") << "!abc:example.org" << true << false;
        QTest::newRow("room with port") << "!abc:example.org:8448" << true << false;
        QTest::newRow("room without server") << "!abcDEF-_123" << true << false;
        QTest::newRow("event") << "$aGVsbG8-_/+=" << false << true;
        QTest::newRow("old event") << "$abc:example.org" << false << true;
        QTest::newRow("empty") << "" << false << false;
        QTest::newRow("bare sigil") << "!" << false << false;
        QTest::newRow("alias") << "#room:example.org" << false << false;
        QTest::newRow("space") << "!ab c:example.org" << false << false;
        QTest::newRow("newline") << "!abc:example.org\n" << false << false;
        QTest::newRow("markup") << "!<b>:example.org" << false << false;
        QTest::newRow("two colons in server") << "!a:b:c:d" << false << false;
        QTest::newRow("too long") << ("!" + QString(300, 'a') + ":x") << false << false;
    }

    void matrixIdsHaveTheRightShape()
    {
        QFETCH(QString, id);
        QFETCH(bool, room);
        QFETCH(bool, event);
        QCOMPARE(IrisBridge::validRoomId(id), room);
        QCOMPARE(IrisBridge::validEventId(id), event);
    }

    void notifyPassesACheckedRequestOn()
    {
        IrisBridge bridge;
        qRegisterMetaType<NotifyRequest>();
        QSignalSpy spy(&bridge, &IrisBridge::notifyRequested);
        QImage image(96, 96, QImage::Format_ARGB32);
        image.fill(Qt::red);
        QVariantMap n = goodNotification();
        n.insert("icon", dataUrl(image));
        n.insert("canReply", false);
        QVERIFY(bridge.notify(n));
        QCOMPARE(spy.count(), 1);
        const auto r = spy.constFirst().constFirst().value<NotifyRequest>();
        QCOMPARE(r.id, QString("$e1"));
        QCOMPARE(r.roomId, QString("!room:example.org"));
        QCOMPARE(r.eventId, QString("$e1"));
        QCOMPARE(r.title, QString("Kitchen"));
        QCOMPARE(r.body, QString("New inbox notification from Sam"));
        QCOMPARE(r.icon.size(), QSize(96, 96));
        QVERIFY(!r.canReply);
    }

    void notifyMinimalAndJpeg()
    {
        IrisBridge bridge;
        QSignalSpy spy(&bridge, &IrisBridge::notifyRequested);
        QVariantMap n = goodNotification();
        n.remove("eventId");
        n["body"] = "";
        QVERIFY(bridge.notify(n));
        QImage image(32, 32, QImage::Format_RGB32);
        image.fill(Qt::blue);
        n.insert("icon", dataUrl(image, "JPEG", "image/jpeg"));
        QVERIFY(bridge.notify(n));
        QCOMPARE(spy.count(), 2);
        QVERIFY(spy.at(0).constFirst().value<NotifyRequest>().canReply); // the default
        QVERIFY(spy.at(0).constFirst().value<NotifyRequest>().icon.isNull());
        QVERIFY(!spy.at(1).constFirst().value<NotifyRequest>().icon.isNull());
        // Newlines and tabs are fine in a body, other control characters are not.
        n["body"] = "line one\nline two\t!";
        QVERIFY(bridge.notify(n));
    }

    void notifyRefusesBadArguments_data()
    {
        QTest::addColumn<QString>("key");
        QTest::addColumn<QVariant>("value");
        QTest::newRow("id missing") << "id" << QVariant();
        QTest::newRow("id number") << "id" << QVariant(5);
        QTest::newRow("id empty") << "id" << QVariant("");
        QTest::newRow("id too long") << "id" << QVariant(QString(IrisBridge::maxIdLength + 1, 'a'));
        QTest::newRow("id newline") << "id" << QVariant("a\nb");
        QTest::newRow("roomId not a room") << "roomId" << QVariant("#room:example.org");
        QTest::newRow("roomId an event") << "roomId" << QVariant("$e1");
        QTest::newRow("roomId list") << "roomId" << QVariant(QStringList{"!a:b"});
        QTest::newRow("eventId not an event") << "eventId" << QVariant("!room:example.org");
        QTest::newRow("eventId number") << "eventId" << QVariant(1);
        QTest::newRow("eventId empty") << "eventId" << QVariant("");
        QTest::newRow("title empty") << "title" << QVariant("");
        QTest::newRow("title too long") << "title" << QVariant(QString(IrisBridge::maxTitleLength + 1, 'a'));
        QTest::newRow("title control") << "title" << QVariant(QString("a") + QChar(0x07));
        QTest::newRow("title newline") << "title" << QVariant("a\nb");
        QTest::newRow("title null") << "title" << QVariant(QVariant::fromValue(nullptr));
        QTest::newRow("body number") << "body" << QVariant(3.5);
        QTest::newRow("body too long") << "body" << QVariant(QString(IrisBridge::maxBodyLength + 1, 'a'));
        QTest::newRow("body control") << "body" << QVariant(QString("a") + QChar(0x1b) + "[2J");
        QTest::newRow("body lone surrogate") << "body" << QVariant(QString("a") + QChar(0xD800));
        QTest::newRow("canReply string") << "canReply" << QVariant("yes");
        QTest::newRow("canReply number") << "canReply" << QVariant(1);
        QTest::newRow("icon url") << "icon" << QVariant("https://example.org/a.png");
        QTest::newRow("icon file") << "icon" << QVariant("file:///etc/passwd");
        QTest::newRow("icon svg") << "icon" << QVariant("data:image/svg+xml;base64,PHN2Zy8+");
        QTest::newRow("icon not base64") << "icon" << QVariant("data:image/png;base64,@@@@");
        QTest::newRow("icon not an image") << "icon" << QVariant("data:image/png;base64,AAAAAAAA");
        QTest::newRow("icon empty") << "icon" << QVariant("data:image/png;base64,");
        QTest::newRow("icon number") << "icon" << QVariant(1);
        QTest::newRow("extra key") << "path" << QVariant("/etc/passwd");
    }

    void notifyRefusesBadArguments()
    {
        QFETCH(QString, key);
        QFETCH(QVariant, value);
        IrisBridge bridge;
        QSignalSpy spy(&bridge, &IrisBridge::notifyRequested);
        QVariantMap n = goodNotification();
        if (value.isValid())
            n.insert(key, value);
        else
            n.remove(key);
        QVERIFY(!bridge.notify(n));
        QCOMPARE(spy.count(), 0);
    }

    void notifyRefusesAnOversizedOrBrokenIcon()
    {
        IrisBridge bridge;
        QSignalSpy spy(&bridge, &IrisBridge::notifyRequested);
        QVariantMap n = goodNotification();
        QImage big(IrisBridge::maxIconPixels + 1, 8, QImage::Format_RGB32);
        big.fill(Qt::green);
        n["icon"] = dataUrl(big);
        QVERIFY(!bridge.notify(n)); // too many pixels
        QImage noisy(600, 600, QImage::Format_RGB32); // many bytes, fine in pixels
        for (int y = 0; y < noisy.height(); ++y)
            for (int x = 0; x < noisy.width(); ++x)
                noisy.setPixel(x, y, qRgb(QRandomGenerator::global()->bounded(256), QRandomGenerator::global()->bounded(256), QRandomGenerator::global()->bounded(256)));
        n["icon"] = dataUrl(noisy);
        QVERIFY(!bridge.notify(n)); // too many bytes
        // A PNG header cut short, and a JPEG declared as a PNG.
        QImage ok(16, 16, QImage::Format_RGB32);
        ok.fill(Qt::black);
        n["icon"] = dataUrl(ok).left(60);
        QVERIFY(!bridge.notify(n));
        n["icon"] = dataUrl(ok, "JPEG", "image/png");
        QVERIFY(!bridge.notify(n));
        QCOMPARE(spy.count(), 0);
    }

    void closeNotificationsChecksTheRoom()
    {
        IrisBridge bridge;
        QSignalSpy spy(&bridge, &IrisBridge::closeNotificationsRequested);
        QVERIFY(bridge.closeNotifications({{"roomId", "!room:example.org"}}));
        QCOMPARE(spy.count(), 1);
        QCOMPARE(spy.constFirst().constFirst().toString(), QString("!room:example.org"));
        QVERIFY(!bridge.closeNotifications({}));
        QVERIFY(!bridge.closeNotifications({{"roomId", "room"}}));
        QVERIFY(!bridge.closeNotifications({{"roomId", 3}}));
        QVERIFY(!bridge.closeNotifications({{"roomId", "!a:b"}, {"x", 1}}));
        QCOMPARE(spy.count(), 1);
    }

    void openRoomAndReplyAreEmittedButNotRemembered()
    {
        IrisBridge bridge;
        QSignalSpy spy(&bridge, &IrisBridge::eventEmitted);
        bridge.openRoom("!r:x", "$e");
        bridge.openRoom("!r:x", "");
        bridge.reply("!r:x", "$e", "hello \"there\"");
        QCOMPARE(spy.count(), 3);
        QCOMPARE(spy.at(0).at(0).toString(), QString("openRoom"));
        QCOMPARE(QJsonDocument::fromJson(spy.at(0).at(1).toString().toUtf8()).object(), (QJsonObject{{"roomId", "!r:x"}, {"eventId", "$e"}}));
        QCOMPARE(QJsonDocument::fromJson(spy.at(1).at(1).toString().toUtf8()).object(), (QJsonObject{{"roomId", "!r:x"}}));
        QCOMPARE(spy.at(2).at(0).toString(), QString("reply"));
        QCOMPARE(QJsonDocument::fromJson(spy.at(2).at(1).toString().toUtf8()).object(),
                 (QJsonObject{{"roomId", "!r:x"}, {"eventId", "$e"}, {"text", "hello \"there\""}}));
        // Replayed to late handlers? No: only state is.
        QVERIFY(QJsonDocument::fromJson(bridge.latestEvents().toUtf8()).object().isEmpty());
    }

    void offeredOnlyOnTheAllowedOrigin()
    {
        NavigationPolicy policy{testOrigin};
        BridgeHost host(&policy);
        QVERIFY(!host.bridgeRegistered());

        host.pageUrlChanged(QUrl("https://example.com/"));
        QVERIFY(!host.bridgeRegistered());
        QVERIFY(!host.channel()->registeredObjects().contains("irisDesktop"));

        host.pageUrlChanged(QUrl("https://iris.example.org/#/home"));
        QVERIFY(host.bridgeRegistered());
        QCOMPARE(host.channel()->registeredObjects().value("irisDesktop"), host.bridge());

        // Leaving Iris takes it away again.
        host.pageUrlChanged(QUrl("https://iris.example.org.evil.example/"));
        QVERIFY(!host.bridgeRegistered());
        QVERIFY(!host.channel()->registeredObjects().contains("irisDesktop"));

        host.pageUrlChanged(QUrl("http://iris.example.org/"));
        QVERIFY(!host.bridgeRegistered());
    }

    void injectedScriptGuardsTheOrigin()
    {
        NavigationPolicy policy{testOrigin};
        BridgeHost host(&policy);
        const QString script = host.injectedScript();
        QVERIFY(script.startsWith("(function () {\nif (location.origin !== [\"https://iris.example.org\"][0]) return;"));
        QVERIFY(script.contains("QWebChannel"));
        QVERIFY(script.contains("irisDesktop"));
    }
};

QTEST_GUILESS_MAIN(IrisBridgeTest)
#include "tst_irisbridge.moc"
