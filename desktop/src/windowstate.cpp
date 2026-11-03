#include "windowstate.h"

#include <KConfigGroup>
#include <KSharedConfig>

#include <QGuiApplication>
#include <QScreen>
#include <QWindow>

static KConfigGroup stateGroup()
{
    return KSharedConfig::openConfig()->group(QStringLiteral("Window"));
}

WindowState::WindowState(QWindow *window)
    : QObject(window)
    , m_window(window)
{
    m_saveTimer.setSingleShot(true);
    m_saveTimer.setInterval(500);
    connect(&m_saveTimer, &QTimer::timeout, this, &WindowState::save);
    auto schedule = [this] { m_saveTimer.start(); };
    connect(window, &QWindow::xChanged, this, schedule);
    connect(window, &QWindow::yChanged, this, schedule);
    connect(window, &QWindow::widthChanged, this, schedule);
    connect(window, &QWindow::heightChanged, this, schedule);
    connect(window, &QWindow::windowStateChanged, this, schedule);
    connect(qApp, &QCoreApplication::aboutToQuit, this, &WindowState::save);
}

void WindowState::restore()
{
    const KConfigGroup group = stateGroup();
    const QRect saved = group.readEntry("Geometry", QRect());
    if (saved.isValid()) {
        m_window->resize(saved.size());
        // Only put the window where a screen can show it.
        for (QScreen *screen : QGuiApplication::screens()) {
            if (screen->availableGeometry().intersects(saved)) {
                m_window->setPosition(saved.topLeft());
                break;
            }
        }
    }
    if (group.readEntry("Maximized", false))
        m_window->setWindowStates(Qt::WindowMaximized);
}

void WindowState::save()
{
    KConfigGroup group = stateGroup();
    const bool maximized = m_window->windowStates() & Qt::WindowMaximized;
    group.writeEntry("Maximized", maximized);
    // Keep the normal geometry while maximised, so un-maximising returns to it.
    if (!maximized && !(m_window->windowStates() & Qt::WindowFullScreen))
        group.writeEntry("Geometry", m_window->geometry());
    group.sync();
}
