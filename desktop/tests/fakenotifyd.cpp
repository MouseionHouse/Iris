// The fake notification server as a process, for tests/e2e. Appends one JSON object per line to the
// file given by --log, and takes commands on stdin, one per line:
//   action <id> <key>   emit ActionInvoked (key "default" is a click on the popup)
//   reply <id> <text>   emit NotificationReplied
//   closed <id> <reason>
// --no-inline-reply leaves "inline-reply" out of the capabilities.
#include "fakenotificationserver.h"

#include <QCoreApplication>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSocketNotifier>

#include <cstdio>
#include <unistd.h>

int main(int argc, char *argv[])
{
    QCoreApplication app(argc, argv);
    const QStringList args = app.arguments();
    const qsizetype logAt = args.indexOf(QStringLiteral("--log"));
    if (logAt < 0 || logAt + 1 >= args.size())
        return 2;
    QFile log(args.at(logAt + 1));
    if (!log.open(QIODevice::Append))
        return 2;
    auto write = [&log](const QJsonObject &o) {
        log.write(QJsonDocument(o).toJson(QJsonDocument::Compact) + '\n');
        log.flush();
    };

    FakeNotificationServer server(!args.contains(QStringLiteral("--no-inline-reply")));
    if (!server.start()) {
        fprintf(stderr, "fakenotifyd: cannot own org.freedesktop.Notifications\n");
        return 3;
    }
    QObject::connect(&server, &FakeNotificationServer::notified, &app, [&] {
        const auto &c = server.calls.constLast();
        QJsonObject hints;
        for (auto it = c.hints.cbegin(); it != c.hints.cend(); ++it)
            hints.insert(it.key(), it.value().canConvert<QString>() ? QJsonValue(it.value().toString()) : QJsonValue(QStringLiteral("<%1>").arg(QString::fromLatin1(it.value().typeName()))));
        write({{"event", "Notify"}, {"id", int(c.id)}, {"appName", c.appName}, {"appIcon", c.appIcon}, {"summary", c.summary}, {"body", c.body}, {"actions", QJsonArray::fromStringList(c.actions)}, {"hints", hints}});
    });
    // The slot appends first; log CloseNotification calls from the same list.
    QObject::connect(&server, &FakeNotificationServer::NotificationClosed, &app, [&](uint id, uint reason) {
        if (reason == 3)
            write({{"event", "CloseNotification"}, {"id", int(id)}});
    });

    QFile in;
    if (!in.open(stdin, QIODevice::ReadOnly))
        return 2;
    QSocketNotifier notifier(STDIN_FILENO, QSocketNotifier::Read);
    QByteArray pending;
    QObject::connect(&notifier, &QSocketNotifier::activated, &app, [&] {
        const QByteArray chunk = in.read(4096);
        if (chunk.isEmpty()) {
            app.quit();
            return;
        }
        pending += chunk;
        while (pending.contains('\n')) {
            const qsizetype nl = pending.indexOf('\n');
            const QString line = QString::fromUtf8(pending.left(nl));
            pending.remove(0, nl + 1);
            const QStringList parts = line.split(QLatin1Char(' '));
            if (parts.size() >= 3 && parts.at(0) == QLatin1String("action"))
                Q_EMIT server.ActionInvoked(parts.at(1).toUInt(), parts.at(2));
            else if (parts.size() >= 3 && parts.at(0) == QLatin1String("reply"))
                Q_EMIT server.NotificationReplied(parts.at(1).toUInt(), line.section(QLatin1Char(' '), 2));
            else if (parts.size() >= 3 && parts.at(0) == QLatin1String("closed"))
                Q_EMIT server.NotificationClosed(parts.at(1).toUInt(), parts.at(2).toUInt());
        }
    });
    write({{"event", "ready"}});
    return app.exec();
}
