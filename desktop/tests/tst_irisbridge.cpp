#include "irisbridge.h"
#include "navigationpolicy.h"
#include "shellconfig.h"

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
