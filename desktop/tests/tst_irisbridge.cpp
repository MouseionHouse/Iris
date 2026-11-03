#include "irisbridge.h"
#include "navigationpolicy.h"
#include "shellconfig.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QSignalSpy>
#include <QTest>
#include <QWebChannel>

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
        NavigationPolicy policy{QString(ShellConfig::origin)};
        BridgeHost host(&policy);
        QVERIFY(host.bridge()->setUnread({{"total", 3}, {"highlight", 1}}));
        QSignalSpy spy(host.bridge(), &IrisBridge::unreadChanged);
        host.pageLoaded(QUrl("https://example.com/"));
        QCOMPARE(spy.count(), 0);
        host.pageLoaded(QUrl("https://iris.example.org/"));
        QCOMPARE(spy.count(), 1);
    }

    void offeredOnlyOnTheAllowedOrigin()
    {
        NavigationPolicy policy{QString(ShellConfig::origin)};
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
        NavigationPolicy policy{QString(ShellConfig::origin)};
        BridgeHost host(&policy);
        const QString script = host.injectedScript();
        QVERIFY(script.startsWith("(function () {\nif (location.origin !== [\"https://iris.example.org\"][0]) return;"));
        QVERIFY(script.contains("QWebChannel"));
        QVERIFY(script.contains("irisDesktop"));
    }
};

QTEST_GUILESS_MAIN(IrisBridgeTest)
#include "tst_irisbridge.moc"
