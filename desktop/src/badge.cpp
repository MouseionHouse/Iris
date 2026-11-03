#include "badge.h"

#include "shellconfig.h"

#include <QDBusConnection>
#include <QVariantMap>

QString Badge::entryUri()
{
    return QStringLiteral("application://%1.desktop").arg(ShellConfig::desktopFileName);
}

QDBusMessage Badge::message(qint64 count)
{
    if (count < 0)
        count = 0;
    const QVariantMap properties{
        {QStringLiteral("count"), count},
        {QStringLiteral("count-visible"), count > 0},
    };
    auto msg = QDBusMessage::createSignal(QStringLiteral("/house/mouseion/iris"),
                                          QStringLiteral("com.canonical.Unity.LauncherEntry"),
                                          QStringLiteral("Update"));
    msg << entryUri() << properties;
    return msg;
}

bool Badge::send(qint64 count)
{
    return QDBusConnection::sessionBus().send(message(count));
}
