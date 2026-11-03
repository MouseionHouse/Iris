#pragma once

#include <QDBusMessage>
#include <QString>

// The unread count on the taskbar entry, drawn by Plasma (and Unity, Dash to Dock...) from the
// com.canonical.Unity.LauncherEntry Update signal. Nothing else in the shell sends it.
class Badge
{
public:
    // The launcher entry is named after the desktop file: "application://<desktopFileName>.desktop".
    static QString entryUri();
    // The signal, unaddressed (a broadcast, as the interface expects). Count is clamped to >= 0;
    // count-visible is false at 0.
    static QDBusMessage message(qint64 count);
    // Broadcast on the session bus. False if the bus is unavailable.
    static bool send(qint64 count);
};
