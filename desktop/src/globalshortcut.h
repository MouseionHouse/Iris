#pragma once

class QAction;
class QObject;

namespace ShowHideShortcut {

// "Show or hide Iris" in System Settings -> Shortcuts -> Iris, registered with KGlobalAccel and
// with no default key: the user picks one there. Connect to triggered() to act on it.
QAction *createShowHide(QObject *parent);

}
