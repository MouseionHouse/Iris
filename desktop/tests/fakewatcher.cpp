// A stand-in for Plasma's StatusNotifierWatcher, for the end-to-end script on a private session
// bus: owns org.kde.StatusNotifierWatcher, says a host is there, and prints each item that registers
// ("registered <service>") so the script can find it. Not installed.
#include <QCoreApplication>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusContext>
#include <QStringList>
#include <cstdio>

class Watcher : public QObject, protected QDBusContext
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.kde.StatusNotifierWatcher")
    Q_PROPERTY(bool IsStatusNotifierHostRegistered READ hostRegistered)
    Q_PROPERTY(int ProtocolVersion READ protocolVersion)
    Q_PROPERTY(QStringList RegisteredStatusNotifierItems READ items)
public:
    bool hostRegistered() const { return true; }
    int protocolVersion() const { return 0; }
    QStringList items() const { return m_items; }
public Q_SLOTS:
    void RegisterStatusNotifierItem(const QString &service)
    {
        // KStatusNotifierItem passes its object path or service name; the sender is the service.
        const QString full = service.startsWith('/') ? message().service() + service : service;
        m_items << full;
        std::printf("registered %s\n", qPrintable(service.startsWith('/') ? message().service() : service));
        std::fflush(stdout);
        Q_EMIT StatusNotifierItemRegistered(full);
    }
    void RegisterStatusNotifierHost(const QString &) {}
Q_SIGNALS:
    void StatusNotifierItemRegistered(const QString &);
    void StatusNotifierHostRegistered();
private:
    QStringList m_items;
};

int main(int argc, char **argv)
{
    QCoreApplication app(argc, argv);
    Watcher watcher;
    QDBusConnection bus = QDBusConnection::sessionBus();
    if (!bus.registerObject("/StatusNotifierWatcher", &watcher, QDBusConnection::ExportAllSlots | QDBusConnection::ExportAllSignals | QDBusConnection::ExportAllProperties)
        || !bus.registerService("org.kde.StatusNotifierWatcher"))
        return 1;
    std::printf("ready\n");
    std::fflush(stdout);
    return app.exec();
}
#include "fakewatcher.moc"
