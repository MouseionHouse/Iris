#include "badge.h"
#include "colorscheme.h"
#include "shellconfig.h"

#include <QGuiApplication>
#include <QSignalSpy>
#include <QColor>
#include <QPalette>
#include <QStyleHints>
#include <QTest>
#include <QVariantMap>

class BadgeTest : public QObject
{
    Q_OBJECT
private Q_SLOTS:
    void entryIsNamedAfterTheDesktopFile()
    {
        QCOMPARE(Badge::entryUri(), QString("application://house.mouseion.iris.desktop"));
        QCOMPARE(Badge::entryUri(), QString("application://%1.desktop").arg(ShellConfig::desktopFileName));
    }

    void updateSignal()
    {
        const QDBusMessage msg = Badge::message(5);
        QCOMPARE(msg.type(), QDBusMessage::SignalMessage);
        QVERIFY(msg.service().isEmpty()); // a broadcast: no destination
        QCOMPARE(msg.path(), QString("/house/mouseion/iris"));
        QCOMPARE(msg.interface(), QString("com.canonical.Unity.LauncherEntry"));
        QCOMPARE(msg.member(), QString("Update"));
        QCOMPARE(msg.arguments().size(), 2);
        QCOMPARE(msg.arguments().at(0).toString(), QString("application://house.mouseion.iris.desktop"));
        // Signature a{sv}, with count an int64 and count-visible a bool.
        QCOMPARE(msg.arguments().at(1).metaType(), QMetaType::fromType<QVariantMap>());
        const QVariantMap p = msg.arguments().at(1).toMap();
        QCOMPARE(p.size(), 2);
        QCOMPARE(p.value("count").metaType(), QMetaType::fromType<qlonglong>());
        QCOMPARE(p.value("count").toLongLong(), 5);
        QCOMPARE(p.value("count-visible").metaType(), QMetaType::fromType<bool>());
        QVERIFY(p.value("count-visible").toBool());
    }

    void hiddenAtZero()
    {
        const QVariantMap p = Badge::message(0).arguments().at(1).toMap();
        QCOMPARE(p.value("count").toLongLong(), 0);
        QVERIFY(!p.value("count-visible").toBool());
        // Never negative.
        const QVariantMap n = Badge::message(-3).arguments().at(1).toMap();
        QCOMPARE(n.value("count").toLongLong(), 0);
        QVERIFY(!n.value("count-visible").toBool());
    }

    void colorSchemeFollowsThePalette()
    {
        // The offscreen platform reports no scheme, so the window background decides (what Plasma
        // changes on a scheme switch); with a platform that reports one, that wins and this is moot.
        if (QGuiApplication::styleHints()->colorScheme() != Qt::ColorScheme::Unknown)
            QSKIP("platform reports a colour scheme itself");
        auto paletteWith = [](QColor window) {
            QPalette p;
            p.setColor(QPalette::Window, window);
            return p;
        };
        QGuiApplication::setPalette(paletteWith(QColor("#eff0f1"))); // Breeze light
        ColorSchemeWatcher watcher;
        QVERIFY(!watcher.dark());
        QSignalSpy spy(&watcher, &ColorSchemeWatcher::darkChanged);
        QGuiApplication::setPalette(paletteWith(QColor("#202326"))); // Breeze dark
        QTRY_COMPARE(spy.count(), 1);
        QCOMPARE(spy.last().at(0).toBool(), true);
        QVERIFY(watcher.dark());
        QGuiApplication::setPalette(paletteWith(QColor("#1b1e20")));
        QCOMPARE(spy.count(), 1); // still dark: no signal
        QGuiApplication::setPalette(paletteWith(QColor("#eff0f1")));
        QTRY_COMPARE(spy.count(), 2);
        QCOMPARE(spy.last().at(0).toBool(), false);
    }
};

int main(int argc, char **argv)
{
    qputenv("QT_QPA_PLATFORM", "offscreen");
    QGuiApplication app(argc, argv);
    BadgeTest test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_badge.moc"
