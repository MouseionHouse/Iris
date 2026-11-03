#include "tray.h"

#include "shellconfig.h"

#include <KStatusNotifierItem>

#include <QAction>
#include <QIcon>
#include <QKeySequence>
#include <QMenu>
#include <QShortcut>
#include <QWindow>

Tray::Tray(QWindow *window, QObject *parent)
    : QObject(parent)
    , m_window(window)
    , m_item(new KStatusNotifierItem(QString(ShellConfig::appId), this))
    
{
    m_item->setCategory(KStatusNotifierItem::Communications);
    m_item->setTitle(QString(ShellConfig::displayName));
    m_item->setStandardActionsEnabled(false);
    m_item->setStatus(KStatusNotifierItem::Active);

    auto *menu = new QMenu;
    auto *show = menu->addAction(QIcon::fromTheme(QStringLiteral("window-new")), QStringLiteral("Show Iris"));
    show->setObjectName(QStringLiteral("show"));
    connect(show, &QAction::triggered, this, [this] { showWindow(m_window); });
    auto *quit = menu->addAction(QIcon::fromTheme(QStringLiteral("application-exit")), QStringLiteral("Quit"));
    quit->setObjectName(QStringLiteral("quit"));
    connect(quit, &QAction::triggered, this, &Tray::quitRequested);
    m_item->setContextMenu(menu); // the item owns the menu

    connect(m_item, &KStatusNotifierItem::activateRequested, this, [this] { toggleWindow(m_window); });

    auto *quitKey = new QShortcut(QKeySequence(Qt::CTRL | Qt::Key_Q), window);
    quitKey->setContext(Qt::ApplicationShortcut);
    quitKey->setObjectName(QStringLiteral("quitKey"));
    connect(quitKey, &QShortcut::activated, this, &Tray::quitRequested);

    setUnread(0, 0);
}

QString Tray::toolTipFor(int total)
{
    if (total <= 0)
        return QString(ShellConfig::displayName);
    return QStringLiteral("%1: %2 unread").arg(ShellConfig::displayName).arg(total);
}

QString Tray::iconNameFor(int highlight)
{
    return QString(highlight > 0 ? ShellConfig::highlightIconName : ShellConfig::iconName);
}

void Tray::showWindow(QWindow *window)
{
    if (window->windowStates() & Qt::WindowMinimized)
        window->setWindowStates(window->windowStates() & ~Qt::WindowMinimized);
    window->show();
    window->raise();
    window->requestActivate();
}

void Tray::toggleWindow(QWindow *window)
{
    if (window->isVisible() && !(window->windowStates() & Qt::WindowMinimized))
        window->hide();
    else
        showWindow(window);
}

void Tray::setUnread(int total, int highlight)
{
    m_item->setIconByName(iconNameFor(highlight));
    m_item->setToolTip(iconNameFor(highlight), toolTipFor(total), QString());
}

void Tray::showStillRunningNotice()
{
    m_item->showMessage(QString(ShellConfig::displayName), QStringLiteral("Iris is still running in the tray"), QString(ShellConfig::iconName));
}
