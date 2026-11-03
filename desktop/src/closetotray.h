#pragma once

#include <QObject>

class QWindow;

// Closing the window hides it; the app keeps running (and syncing) in the tray. Only allowClose()
// lets a close through: the tray's Quit, Ctrl+Q, SIGTERM and the end of the session call it first.
// The first time a close is turned into a hide, firstHide is true; it is remembered in the app's
// KConfig file (group Tray) and never true again.
class CloseToTray : public QObject
{
    Q_OBJECT
public:
    explicit CloseToTray(QWindow *window);

    // From now on a close really closes the window (and so lets the app quit).
    void allowClose() { m_allowClose = true; }
    bool noticeShown() const;

Q_SIGNALS:
    // The window was hidden instead of closed. firstHide: the one time to say so.
    void hiddenToTray(bool firstHide);

protected:
    bool eventFilter(QObject *watched, QEvent *event) override;

private:
    QWindow *m_window;
    bool m_allowClose = false;
};
