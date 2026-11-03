#include "navigationpolicy.h"
#include "shellconfig.h"

#include <QTest>

class NavigationPolicyTest : public QObject
{
    Q_OBJECT
private Q_SLOTS:
    void allowed_data()
    {
        QTest::addColumn<QString>("url");
        QTest::addColumn<bool>("allowed");
        QTest::newRow("root") << "https://iris.example.org" << true;
        QTest::newRow("path") << "https://iris.example.org/#/home/!room:example.org" << true;
        QTest::newRow("explicit port") << "https://iris.example.org:443/x" << true;
        QTest::newRow("upper case host") << "https://IRIS.example.org/" << true;
        QTest::newRow("http") << "http://iris.example.org/" << false;
        QTest::newRow("other port") << "https://iris.example.org:8443/" << false;
        QTest::newRow("parent domain") << "https://mouseion.house/" << false;
        QTest::newRow("subdomain") << "https://evil.iris.example.org/" << false;
        QTest::newRow("sibling") << "https://hub.example.org/" << false;
        QTest::newRow("suffix attack") << "https://iris.example.org.evil.example/" << false;
        QTest::newRow("prefix attack") << "https://eviliris.example.org/" << false;
        QTest::newRow("userinfo") << "https://iris.example.org@evil.example/" << false;
        QTest::newRow("userinfo on allowed host") << "https://user:pw@iris.example.org/" << false;
        QTest::newRow("other site") << "https://example.com/" << false;
        QTest::newRow("file") << "file:///etc/passwd" << false;
        QTest::newRow("javascript") << "javascript:alert(1)" << false;
        QTest::newRow("data") << "data:text/html,hi" << false;
        QTest::newRow("empty") << "" << false;
    }
    void allowed()
    {
        QFETCH(QString, url);
        QFETCH(bool, allowed);
        NavigationPolicy policy{QString(ShellConfig::origin)};
        QCOMPARE(policy.isAllowed(QUrl(url)), allowed);
        // The bridge follows the same rule, and has no other.
        QCOMPARE(policy.bridgeOffered(QUrl(url)), allowed);
    }

    void externalLinksGoToTheOpener()
    {
        NavigationPolicy policy{QString(ShellConfig::origin)};
        QList<QUrl> opened;
        policy.setOpener([&](const QUrl &u) { opened << u; return true; });
        QVERIFY(policy.openExternal(QUrl("https://example.com/a")));
        QVERIFY(policy.openExternal(QUrl("http://example.com/b")));
        QVERIFY(policy.openExternal(QUrl("mailto:a@example.com")));
        QCOMPARE(opened.size(), 3);
    }
    void otherSchemesAreNotLaunched()
    {
        NavigationPolicy policy{QString(ShellConfig::origin)};
        int calls = 0;
        policy.setOpener([&](const QUrl &) { ++calls; return true; });
        QVERIFY(!policy.openExternal(QUrl("file:///etc/passwd")));
        QVERIFY(!policy.openExternal(QUrl("steam://run/1")));
        QVERIFY(!policy.openExternal(QUrl("about:blank")));
        QVERIFY(!policy.openExternal(QUrl()));
        QCOMPARE(calls, 0);
    }
    void configIsConsistent()
    {
        QCOMPARE(QString(ShellConfig::origin), QUrl(QString(ShellConfig::url)).toString(QUrl::RemoveFilename | QUrl::StripTrailingSlash));
        QCOMPARE(QString(ShellConfig::organizationDomain.size() ? "ok" : ""), QString("ok"));
    }
};

QTEST_GUILESS_MAIN(NavigationPolicyTest)
#include "tst_navigationpolicy.moc"
