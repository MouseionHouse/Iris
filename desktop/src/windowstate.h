#pragma once

#include <QObject>
#include <QTimer>

class QWindow;

// Remembers the window's size, position and maximised state in the app's KConfig file.
class WindowState : public QObject
{
    Q_OBJECT
public:
    explicit WindowState(QWindow *window);

    void restore();
    void save();

private:
    QWindow *m_window;
    QTimer m_saveTimer;
};
