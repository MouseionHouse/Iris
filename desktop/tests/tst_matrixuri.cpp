#include "irisbridge.h"
#include "matrixuri.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSignalSpy>
#include <QTest>

Q_DECLARE_METATYPE(MatrixLink)

static MatrixLink link(MatrixLink::Kind kind, const QString &id, const QString &eventId = {}, const QStringList &via = {}, MatrixLink::Action action = MatrixLink::Action::None)
{
    MatrixLink l;
    l.kind = kind;
    l.id = id;
    l.eventId = eventId;
    l.via = via;
    l.action = action;
    return l;
}

class MatrixUriTest : public QObject
{
    Q_OBJECT
private Q_SLOTS:
    void accepts_data()
    {
        QTest::addColumn<QString>("uri");
        QTest::addColumn<MatrixLink>("expected");
        using K = MatrixLink::Kind;
        using A = MatrixLink::Action;
        // The examples of the Matrix spec's "Matrix URI scheme", and the shapes around them.
        QTest::newRow("room id") << "matrix:roomid/rs:example.org" << link(K::Room, "!rs:example.org");
        QTest::newRow("room id with via") << "matrix:roomid/rs:example.org?via=example.org&via=alt.example.org"
                                          << link(K::Room, "!rs:example.org", {}, {"example.org", "alt.example.org"});
        QTest::newRow("room id with action=join") << "matrix:roomid/rs:example.org?action=join&via=example.org"
                                                  << link(K::Room, "!rs:example.org", {}, {"example.org"}, A::Join);
        QTest::newRow("room id with action=chat") << "matrix:roomid/rs:example.org?action=chat" << link(K::Room, "!rs:example.org", {}, {}, A::Chat);
        QTest::newRow("alias") << "matrix:r/us:example.org" << link(K::Alias, "#us:example.org");
        QTest::newRow("alias, event") << "matrix:r/us:example.org/e/lol823y4bcp3qo4" << link(K::Alias, "#us:example.org", "$lol823y4bcp3qo4");
        QTest::newRow("room id, event, via") << "matrix:roomid/rs:example.org/e/lol823y4bcp3qo4?via=example.org"
                                             << link(K::Room, "!rs:example.org", "$lol823y4bcp3qo4", {"example.org"});
        QTest::newRow("user") << "matrix:u/alice:example.org" << link(K::User, "@alice:example.org");
        QTest::newRow("user, action=chat") << "matrix:u/alice:example.org?action=chat" << link(K::User, "@alice:example.org", {}, {}, A::Chat);
        // Details.
        QTest::newRow("scheme in any case") << "MATRIX:u/alice:example.org" << link(K::User, "@alice:example.org");
        QTest::newRow("percent-encoded colon and sigil-free ID") << "matrix:roomid/rs%3Aexample.org" << link(K::Room, "!rs:example.org");
        QTest::newRow("percent-encoded slash in an event ID") << "matrix:roomid/rs:example.org/e/a%2Fb%2Bc" << link(K::Room, "!rs:example.org", "$a/b+c");
        QTest::newRow("percent-encoded unicode alias") << "matrix:r/caf%C3%A9:example.org" << link(K::Alias, QString::fromUtf8("#café:example.org"));
        QTest::newRow("room version 12 ID has no server") << "matrix:roomid/abcDEF_ghi" << link(K::Room, "!abcDEF_ghi");
        QTest::newRow("via with a port and an IPv6 literal") << "matrix:roomid/rs:example.org?via=example.org:8448&via=%5B::1%5D:8448"
                                                             << link(K::Room, "!rs:example.org", {}, {"example.org:8448", "[::1]:8448"});
        QTest::newRow("repeated via is kept once, in order") << "matrix:roomid/rs:example.org?via=b.org&via=a.org&via=b.org" << link(K::Room, "!rs:example.org", {}, {"b.org", "a.org"});
        QTest::newRow("unknown query keys are ignored") << "matrix:u/alice:example.org?foo=bar&action=chat&%66oo" << link(K::User, "@alice:example.org", {}, {}, A::Chat);
        QTest::newRow("empty query") << "matrix:u/alice:example.org?" << link(K::User, "@alice:example.org");
        QTest::newRow("empty query parts") << "matrix:u/alice:example.org?&&action=chat&" << link(K::User, "@alice:example.org", {}, {}, A::Chat);
        QTest::newRow("legacy user with uppercase and slash") << "matrix:u/Alice%2Fbot:example.org" << link(K::User, "@Alice/bot:example.org");
    }
    void accepts()
    {
        QFETCH(QString, uri);
        QFETCH(MatrixLink, expected);
        QString why;
        const auto got = parseMatrixUri(uri, &why);
        QVERIFY2(got.has_value(), qPrintable(why));
        QCOMPARE(got->kind, expected.kind);
        QCOMPARE(got->id, expected.id);
        QCOMPARE(got->eventId, expected.eventId);
        QCOMPARE(got->via, expected.via);
        QCOMPARE(got->action, expected.action);
    }

    void refuses_data()
    {
        QTest::addColumn<QString>("uri");
        QTest::newRow("empty") << "";
        QTest::newRow("scheme only") << "matrix:";
        QTest::newRow("wrong scheme") << "https://matrix.to/#/#us:example.org";
        QTest::newRow("another scheme") << "mailto:alice@example.org";
        QTest::newRow("javascript") << "javascript:alert(1)";
        QTest::newRow("file") << "file:///etc/passwd";
        QTest::newRow("scheme as a prefix of another") << "matrixx:u/alice:example.org";
        QTest::newRow("no scheme") << "u/alice:example.org";
        QTest::newRow("leading space") << " matrix:u/alice:example.org";
        QTest::newRow("trailing space") << "matrix:u/alice:example.org ";
        QTest::newRow("authority") << "matrix://example.org/u/alice:example.org";
        QTest::newRow("authority, empty") << "matrix:///u/alice:example.org";
        QTest::newRow("absolute path") << "matrix:/u/alice:example.org";
        QTest::newRow("fragment") << "matrix:u/alice:example.org#x";
        QTest::newRow("fragment only") << "matrix:#us:example.org";
        QTest::newRow("unknown kind") << "matrix:x/alice:example.org";
        QTest::newRow("kind in capitals") << "matrix:U/alice:example.org";
        QTest::newRow("kind without an ID") << "matrix:u";
        QTest::newRow("kind with a trailing slash") << "matrix:u/";
        QTest::newRow("empty ID") << "matrix:r//e/ev";
        QTest::newRow("empty segment in the middle") << "matrix:r/us:example.org//e/ev";
        QTest::newRow("trailing slash") << "matrix:r/us:example.org/";
        QTest::newRow("extra segments") << "matrix:r/us:example.org/e/ev/more";
        QTest::newRow("event without /e/") << "matrix:r/us:example.org/x/ev";
        QTest::newRow("/e/ without an event") << "matrix:r/us:example.org/e";
        QTest::newRow("/e/ with an empty event") << "matrix:r/us:example.org/e/";
        QTest::newRow("event on a user") << "matrix:u/alice:example.org/e/ev";
        QTest::newRow("a sigil left in") << "matrix:r/%23us:example.org";
        QTest::newRow("a sigil left in, raw") << "matrix:roomid/!rs:example.org";
        QTest::newRow("user sigil left in") << "matrix:u/@alice:example.org";
        QTest::newRow("event sigil left in") << "matrix:r/us:example.org/e/$ev";
        QTest::newRow("alias without a server") << "matrix:r/us";
        QTest::newRow("alias with a bad server") << "matrix:r/us:exa%20mple.org";
        QTest::newRow("alias with an empty local part") << "matrix:r/:example.org";
        QTest::newRow("alias with a space") << "matrix:r/u%20s:example.org";
        QTest::newRow("user with a bad local part") << "matrix:u/al%0Dice:example.org";
        QTest::newRow("user without a server") << "matrix:u/alice";
        QTest::newRow("server with a bad port") << "matrix:u/alice:example.org:99999";
        QTest::newRow("room ID with a space") << "matrix:roomid/r%20s:example.org";
        QTest::newRow("room ID with a quote") << "matrix:roomid/r%22s:example.org";
        QTest::newRow("bad percent-encoding") << "matrix:u/alice%zz:example.org";
        QTest::newRow("truncated percent-encoding") << "matrix:u/alice:example.org%2";
        QTest::newRow("lone percent") << "matrix:u/alice:example.org%";
        QTest::newRow("encoded NUL") << "matrix:u/ali%00ce:example.org";
        QTest::newRow("encoded newline") << "matrix:r/u%0As:example.org";
        QTest::newRow("encoded control (ESC)") << "matrix:r/u%1Bs:example.org";
        QTest::newRow("encoded DEL") << "matrix:r/u%7Fs:example.org";
        QTest::newRow("invalid UTF-8") << "matrix:r/us%FF:example.org";
        QTest::newRow("overlong UTF-8") << "matrix:r/us%C0%AF:example.org";
        QTest::newRow("right-to-left override") << "matrix:r/us%E2%80%AE:example.org";
        QTest::newRow("zero-width space") << "matrix:r/u%E2%80%8Bs:example.org";
        QTest::newRow("raw unicode") << QString::fromUtf8("matrix:r/café:example.org");
        QTest::newRow("raw unicode in the query") << QString::fromUtf8("matrix:u/alice:example.org?action=chät");
        QTest::newRow("raw tab") << "matrix:u/ali\tce:example.org";
        QTest::newRow("raw newline") << "matrix:u/alice:example.org\nmatrix:u/bob:example.org";
        QTest::newRow("raw NUL") << QString::fromLatin1("matrix:u/alice:example.org\0x", 27);
        QTest::newRow("raw backslash") << "matrix:u/ali\\ce:example.org";
        QTest::newRow("action unknown") << "matrix:roomid/rs:example.org?action=delete";
        QTest::newRow("action empty") << "matrix:roomid/rs:example.org?action=";
        QTest::newRow("action without a value") << "matrix:roomid/rs:example.org?action";
        QTest::newRow("action twice") << "matrix:roomid/rs:example.org?action=join&action=chat";
        QTest::newRow("action in capitals") << "matrix:roomid/rs:example.org?action=JOIN";
        QTest::newRow("action=join on a user") << "matrix:u/alice:example.org?action=join";
        QTest::newRow("via on a user") << "matrix:u/alice:example.org?via=example.org";
        QTest::newRow("via empty") << "matrix:roomid/rs:example.org?via=";
        QTest::newRow("via without a value") << "matrix:roomid/rs:example.org?via";
        QTest::newRow("via with a path") << "matrix:roomid/rs:example.org?via=example.org/evil";
        QTest::newRow("via with a userinfo") << "matrix:roomid/rs:example.org?via=a@example.org";
        QTest::newRow("via with a space") << "matrix:roomid/rs:example.org?via=exa%20mple.org";
        QTest::newRow("via with markup") << "matrix:roomid/rs:example.org?via=%3Cscript%3E";
        QTest::newRow("via with a leading dash") << "matrix:roomid/rs:example.org?via=-evil.org";
        QTest::newRow("via with a bad port") << "matrix:roomid/rs:example.org?via=example.org:70000";
        QTest::newRow("key with bad encoding") << "matrix:u/alice:example.org?%zz=1";
        QTest::newRow("injection-looking ID") << "matrix:roomid/x%22%3E%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E:example.org";
        QTest::newRow("shell-looking ID") << "matrix:u/%24(touch%20%2Ftmp%2Fx):example.org";
        QTest::newRow("SQL-looking user") << "matrix:u/a%27%3B%20DROP%20TABLE%20users%3B--:example.org";
        QTest::newRow("JSON-looking alias") << "matrix:r/%22%7D,%7B%22kind%22%3A%22user:example.org";
        QTest::newRow("oversized, one over") << "matrix:u/" + QString(maxMatrixUriLength, 'a') + ":example.org";
        QTest::newRow("oversized ID") << "matrix:u/" + QString(300, 'a') + ":example.org";
        QTest::newRow("oversized server") << "matrix:u/alice:" + QString(300, 'a');
        QTest::newRow("too many via") << "matrix:roomid/rs:example.org?via=a1.org&via=a2.org&via=a3.org&via=a4.org&via=a5.org&via=a6.org&via=a7.org&via=a8.org&via=a9.org&via=a10.org&via=a11.org";
    }
    void refuses()
    {
        QFETCH(QString, uri);
        QString why;
        QVERIFY2(!parseMatrixUri(uri, &why).has_value(), qPrintable("accepted: " + uri));
        QVERIFY(!why.isEmpty());
    }

    void atTheLimits()
    {
        // Exactly the longest URI is looked at (and is refused for its contents, not its size).
        const QString atLimit = "matrix:u/alice:example.org?x=" + QString(maxMatrixUriLength - 29, 'a');
        QCOMPARE(atLimit.size(), maxMatrixUriLength);
        QVERIFY(parseMatrixUri(atLimit).has_value());
        QVERIFY(!parseMatrixUri(atLimit + "a").has_value());
        // Ten different via servers are the most.
        QString ten = "matrix:roomid/rs:example.org?";
        for (int i = 1; i <= 10; ++i)
            ten += QString("via=a%1.org&").arg(i);
        QCOMPARE(parseMatrixUri(ten)->via.size(), 10);
        // An opaque ID is at most 200 characters (the bridge's own rule for room and event IDs).
        QVERIFY(parseMatrixUri("matrix:roomid/rs:example.org/e/" + QString(200, 'a')).has_value());
        QVERIFY(!parseMatrixUri("matrix:roomid/rs:example.org/e/" + QString(201, 'a')).has_value());
    }

    void doesNotCrashOnNoise()
    {
        // Random strings built from the characters the parser cares about: never a crash, and
        // anything accepted is well formed.
        const QString alphabet = QStringLiteral("matrix:/?&=%#@!$.-_ur:eE0123456789abcdefABCDEF\\\" \n");
        quint32 seed = 12345;
        auto next = [&seed] { seed = seed * 1664525u + 1013904223u; return seed >> 8; };
        int accepted = 0;
        for (int i = 0; i < 20000; ++i) {
            QString s = i % 2 ? QStringLiteral("matrix:") : QString();
            const int n = next() % 60;
            for (int j = 0; j < n; ++j)
                s += alphabet.at(next() % alphabet.size());
            if (const auto l = parseMatrixUri(s)) {
                ++accepted;
                QVERIFY(!l->id.isEmpty() && QStringLiteral("!#@").contains(l->id.at(0)));
                QVERIFY(l->eventId.isEmpty() || l->eventId.startsWith(u'$'));
            }
        }
        qInfo("noise: %d accepted of 20000", accepted);
    }

    void jsonPayload()
    {
        auto payload = [](const MatrixLink &l) { return QJsonDocument::fromJson(l.toJson().toUtf8()).object(); };
        using K = MatrixLink::Kind;
        QCOMPARE(payload(link(K::User, "@a:b.org")), (QJsonObject{{"kind", "user"}, {"id", "@a:b.org"}}));
        QCOMPARE(payload(link(K::Alias, "#a:b.org", "$e", {"x.org", "y.org"}, MatrixLink::Action::Join)),
                 (QJsonObject{{"kind", "alias"}, {"id", "#a:b.org"}, {"eventId", "$e"}, {"via", QJsonArray{"x.org", "y.org"}}, {"action", "join"}}));
        QCOMPARE(payload(link(K::Room, "!r:b.org", {}, {}, MatrixLink::Action::Chat)), (QJsonObject{{"kind", "room"}, {"id", "!r:b.org"}, {"action", "chat"}}));
    }

    void argumentsKeepOnlyLinksThatParse()
    {
        const auto links = matrixLinksFromArguments({"--hidden", "matrix:u/alice:example.org", "https://example.org/", "--", "matrix:r/us:example.org/e/ev?via=example.org"});
        QCOMPARE(links.size(), 2);
        QCOMPARE(links.at(0).id, QString("@alice:example.org"));
        QCOMPARE(links.at(1).eventId, QString("$ev"));
        QVERIFY(matrixLinksFromArguments({"matrix://evil/u/a:b.org", "javascript:1"}).isEmpty());
        // Only the first few arguments are looked at.
        QStringList many;
        for (int i = 0; i < 10; ++i)
            many << "matrix:u/alice:example.org";
        QCOMPARE(matrixLinksFromArguments(many).size(), maxMatrixLinksPerLaunch);
    }

    void bridgeHoldsLinksUntilThePageAsksThenEmitsOnce()
    {
        IrisBridge bridge;
        QSignalSpy spy(&bridge, &IrisBridge::eventEmitted);
        const auto a = *parseMatrixUri("matrix:u/alice:example.org");
        const auto b = *parseMatrixUri("matrix:r/us:example.org");
        bridge.openLink(a);
        bridge.openLink(b);
        QCOMPARE(spy.count(), 0); // cold start: nothing is sent before the page is up
        const QStringList pending = bridge.takePendingLinks();
        QCOMPARE(pending, (QStringList{a.toJson(), b.toJson()}));
        QCOMPARE(spy.count(), 0);
        QVERIFY(bridge.takePendingLinks().isEmpty()); // delivered once
        bridge.openLink(b); // the page is up: now it is an event
        QCOMPARE(spy.count(), 1);
        QCOMPARE(spy.last(), (QVariantList{"openLink", b.toJson()}));
        // A page that starts loading has no adapter yet: links wait again.
        bridge.pageLoading();
        bridge.openLink(a);
        QCOMPARE(spy.count(), 1);
        QCOMPARE(bridge.takePendingLinks(), QStringList{a.toJson()});
    }

    void bridgeKeepsTheNewestEightWaiting()
    {
        IrisBridge bridge;
        for (int i = 0; i < 12; ++i)
            bridge.openLink(*parseMatrixUri(QString("matrix:u/user%1:example.org").arg(i)));
        const QStringList pending = bridge.takePendingLinks();
        QCOMPARE(pending.size(), IrisBridge::maxPendingLinks);
        QVERIFY(pending.first().contains("user4"));
        QVERIFY(pending.last().contains("user11"));
    }
};

QTEST_MAIN(MatrixUriTest)
#include "tst_matrixuri.moc"
