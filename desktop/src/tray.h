#pragma once

#include <QObject>
#include <QString>

class KStatusNotifierItem;
class QAction;
class QMenu;
class QWindow;

// The tray icon (a StatusNotifierItem): click shows or hides the window, the menu has Show Iris
// and Quit, the tooltip follows the unread state the bridge reports. A mention marks the item as
// Konversation does, with NeedsAttention, plus a theme emblem over the app icon.
class Tray : public QObject
{
    Q_OBJECT
public:
    explicit Tray(QWindow *window, QObject *parent = nullptr);

    // "Iris: 3 unread"; just "Iris" when there is nothing unread.
    static QString toolTipFor(int total);
    // Nothing, or the theme emblem the tray draws over the icon when something mentions you
    // (highlight > 0).
    static QString overlayIconNameFor(int highlight);

    // Show the window, raised and focused (a minimised one is restored).
    static void showWindow(QWindow *window);
    // Hide a visible window; show a hidden or minimised one.
    static void toggleWindow(QWindow *window);

    void setUnread(int total, int highlight);
    // The one-off "Iris is still running in the tray" message, through the tray item.
    void showStillRunningNotice();

    KStatusNotifierItem *item() const { return m_item; }

Q_SIGNALS:
    // Quit in the tray menu, or Ctrl+Q in the window.
    void quitRequested();

private:
    QWindow *m_window;
    KStatusNotifierItem *m_item;
};
