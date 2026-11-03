#include "closetotray.h"

#include <KConfigGroup>
#include <KSharedConfig>

#include <QEvent>
#include <QWindow>

static KConfigGroup trayGroup()
{
    return KSharedConfig::openConfig()->group(QStringLiteral("Tray"));
}

CloseToTray::CloseToTray(QWindow *window)
    : QObject(window)
    , m_window(window)
{
    window->installEventFilter(this);
}

bool CloseToTray::noticeShown() const
{
    return trayGroup().readEntry("StillRunningNoticeShown", false);
}

bool CloseToTray::eventFilter(QObject *watched, QEvent *event)
{
    if (watched != m_window || event->type() != QEvent::Close || m_allowClose)
        return false;
    event->ignore();
    m_window->hide();
    const bool first = !noticeShown();
    if (first) {
        KConfigGroup group = trayGroup();
        group.writeEntry("StillRunningNoticeShown", true);
        group.sync();
    }
    Q_EMIT hiddenToTray(first);
    return true;
}
