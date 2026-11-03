#include "closetotray.h"
#include "globalshortcut.h"
#include "shellconfig.h"
#include "tray.h"

#include <KConfigGroup>
#include <KSharedConfig>
#include <KStatusNotifierItem>

#include <QAction>
#include <QApplication>
#include <QKeySequence>
#include <QMenu>
#include <QSignalSpy>
#include <QStandardPaths>
#include <QTest>
#include <QWindow>

class TrayTest : public QObject
{
    Q_OBJECT
private Q_SLOTS:
    void init()
    {
        // A fresh config file for each test, in the test location.
        KSharedConfig::openConfig()->group(QStringLiteral("Tray")).deleteGroup();
        KSharedConfig::openConfig()->sync();
    }

    void toolTipSaysHowManyAreUnread()
    {
        QCOMPARE(Tray::toolTipFor(3), QString("Iris: 3 unread"));
        QCOMPARE(Tray::toolTipFor(1), QString("Iris: 1 unread"));
        QCOMPARE(Tray::toolTipFor(0), QString("Iris"));
    }

    void iconHasTheDotOnlyForHighlights()
    {
        QCOMPARE(Tray::iconNameFor(0), QString("house.mouseion.iris"));
        QCOMPARE(Tray::iconNameFor(1), QString("house.mouseion.iris-highlight"));
        QCOMPARE(Tray::iconNameFor(40), QString("house.mouseion.iris-highlight"));
    }

    void itemFollowsTheUnreadState()
    {
        QWindow window;
        Tray tray(&window);
        QCOMPARE(tray.item()->iconName(), QString("house.mouseion.iris"));
        QCOMPARE(tray.item()->toolTipTitle(), QString("Iris"));
        tray.setUnread(5, 0);
        QCOMPARE(tray.item()->iconName(), QString("house.mouseion.iris"));
        QCOMPARE(tray.item()->toolTipTitle(), QString("Iris: 5 unread"));
        tray.setUnread(5, 2);
        QCOMPARE(tray.item()->iconName(), QString("house.mouseion.iris-highlight"));
        QCOMPARE(tray.item()->toolTipTitle(), QString("Iris: 5 unread"));
        tray.setUnread(0, 0);
        QCOMPARE(tray.item()->iconName(), QString("house.mouseion.iris"));
        QCOMPARE(tray.item()->toolTipTitle(), QString("Iris"));
    }

    void menuHasShowAndQuit()
    {
        QWindow window;
        Tray tray(&window);
        QStringList texts;
        for (QAction *a : tray.item()->contextMenu()->actions())
            texts << a->text();
        QCOMPARE(texts, QStringList({"Show Iris", "Quit"}));
        QSignalSpy quit(&tray, &Tray::quitRequested);
        tray.item()->contextMenu()->findChild<QAction *>("quit")->trigger();
        QCOMPARE(quit.count(), 1);
        window.hide();
        tray.item()->contextMenu()->findChild<QAction *>("show")->trigger();
        QVERIFY(window.isVisible());
    }

    void activateTogglesTheWindow()
    {
        QWindow window;
        window.show();
        Tray tray(&window);
        QVERIFY(window.isVisible());
        tray.item()->activate(QPoint());
        QVERIFY(!window.isVisible());
        tray.item()->activate(QPoint());
        QVERIFY(window.isVisible());
    }

    void ctrlQAsksToQuit()
    {
        QWindow window;
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        window.requestActivate();
        QVERIFY(QTest::qWaitForWindowActive(&window));
        Tray tray(&window);
        QSignalSpy quit(&tray, &Tray::quitRequested);
        QTest::keyClick(&window, Qt::Key_Q, Qt::ControlModifier);
        QCOMPARE(quit.count(), 1);
    }

    void closingHidesInsteadOfClosing()
    {
        QWindow window;
        window.show();
        CloseToTray closer(&window);
        QSignalSpy hidden(&closer, &CloseToTray::hiddenToTray);
        window.close();
        QVERIFY(!window.isVisible());
        QCOMPARE(hidden.count(), 1);
        // The window is still there to be shown again.
        window.show();
        QVERIFY(window.isVisible());
    }

    void theNoticeIsFirstOnceAndRemembered()
    {
        {
            QWindow window;
            window.show();
            CloseToTray closer(&window);
            QVERIFY(!closer.noticeShown());
            QSignalSpy hidden(&closer, &CloseToTray::hiddenToTray);
            window.close();
            window.show();
            window.close();
            QCOMPARE(hidden.count(), 2);
            QCOMPARE(hidden.at(0).at(0).toBool(), true);
            QCOMPARE(hidden.at(1).at(0).toBool(), false);
            QVERIFY(closer.noticeShown());
        }
        // A new run (a new object over the same config file) does not say it again.
        QWindow window;
        window.show();
        CloseToTray closer(&window);
        QVERIFY(closer.noticeShown());
        QSignalSpy hidden(&closer, &CloseToTray::hiddenToTray);
        window.close();
        QCOMPARE(hidden.count(), 1);
        QCOMPARE(hidden.at(0).at(0).toBool(), false);
    }

    void allowCloseLetsTheWindowClose()
    {
        QWindow window;
        window.show();
        CloseToTray closer(&window);
        QSignalSpy hidden(&closer, &CloseToTray::hiddenToTray);
        closer.allowClose();
        window.close();
        QVERIFY(!window.isVisible());
        QCOMPARE(hidden.count(), 0);
        QVERIFY(!closer.noticeShown());
    }

    void shortcutHasNoDefaultKey()
    {
        QObject owner;
        QAction *a = ShowHideShortcut::createShowHide(&owner);
        QCOMPARE(a->text(), QString("Show or hide Iris"));
        QCOMPARE(a->property("componentName").toString(), QString(ShellConfig::appId));
        QCOMPARE(a->property("componentDisplayName").toString(), QString("Iris"));
        QVERIFY(a->shortcuts().isEmpty());
    }
};

int main(int argc, char **argv)
{
    qputenv("QT_QPA_PLATFORM", "offscreen");
    QStandardPaths::setTestModeEnabled(true);
    QApplication app(argc, argv);
    app.setApplicationName("iris-tray-test");
    TrayTest test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_tray.moc"
