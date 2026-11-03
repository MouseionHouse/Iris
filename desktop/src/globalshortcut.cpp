#include "globalshortcut.h"

#include "shellconfig.h"

#include <KGlobalAccel>

#include <QAction>
#include <QKeySequence>
#include <QList>

QAction *ShowHideShortcut::createShowHide(QObject *parent)
{
    auto *action = new QAction(QStringLiteral("Show or hide Iris"), parent);
    action->setObjectName(QStringLiteral("show-or-hide"));
    // How KGlobalAccel names the component and its row in System Settings.
    action->setProperty("componentName", QString(ShellConfig::appId));
    action->setProperty("componentDisplayName", QString(ShellConfig::displayName));
    // An empty default; a key the user has set is loaded back (Autoloading) on every start.
    KGlobalAccel::self()->setDefaultShortcut(action, QList<QKeySequence>());
    KGlobalAccel::self()->setShortcut(action, QList<QKeySequence>());
    return action;
}
