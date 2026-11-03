#include "irisbridge.h"
#include "navigationpolicy.h"
#include "networkwatch.h"
#include "shellconfig.h"
#include "windowstate.h"

#include <KDBusService>
#include <KSignalHandler>

#include <QCommandLineParser>
#include <QDir>
#include <QFile>
#include <QGuiApplication>
#include <QIcon>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QStandardPaths>
#include <QtWebEngineQuick>

#include <csignal>

#ifndef IRIS_SHELL_VERSION
#define IRIS_SHELL_VERSION "0.0.0"
#endif

// Everything QML needs that is not a type of its own.
class ShellInfo : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QUrl startUrl MEMBER startUrl CONSTANT)
    Q_PROPERTY(QString version MEMBER version CONSTANT)
    Q_PROPERTY(QString profileName MEMBER profileName CONSTANT)
    Q_PROPERTY(QString dataPath MEMBER dataPath CONSTANT)
    Q_PROPERTY(QString cachePath MEMBER cachePath CONSTANT)
    Q_PROPERTY(QString downloadPath MEMBER downloadPath CONSTANT)
    Q_PROPERTY(QString bridgeScript MEMBER bridgeScript CONSTANT)
    Q_PROPERTY(int retryIntervalMs MEMBER retryIntervalMs CONSTANT)
    Q_PROPERTY(bool testHooks MEMBER testHooks CONSTANT)
public:
    using QObject::QObject;
    QUrl startUrl;
    QString version = QStringLiteral(IRIS_SHELL_VERSION);
    QString profileName;
    QString dataPath;
    QString cachePath;
    QString downloadPath;
    QString bridgeScript;
    int retryIntervalMs = 15000;
    bool testHooks = false;
};

int main(int argc, char *argv[])
{
    QtWebEngineQuick::initialize();
    QGuiApplication app(argc, argv);
    app.setOrganizationDomain(ShellConfig::organizationDomain);
    app.setApplicationName(ShellConfig::applicationName);
    app.setApplicationDisplayName(ShellConfig::displayName);
    app.setApplicationVersion(QStringLiteral(IRIS_SHELL_VERSION));
    app.setDesktopFileName(ShellConfig::desktopFileName);
    app.setWindowIcon(QIcon::fromTheme(ShellConfig::iconName, QIcon(QStringLiteral(":/iris/icon.svg"))));

    QCommandLineParser parser;
    parser.setApplicationDescription(QStringLiteral("Iris, the house Matrix client"));
    parser.addHelpOption();
    parser.addVersionOption();
    parser.addPositionalArgument(QStringLiteral("uri"), QStringLiteral("A matrix: link to open (handled by a later release)."), QStringLiteral("[uri]"));
    parser.process(app);

    KDBusService service(KDBusService::Unique);

    // Quit cleanly on SIGTERM/SIGINT so WebEngine flushes the profile (login, storage) to disk.
    KSignalHandler::self()->watchSignal(SIGTERM);
    KSignalHandler::self()->watchSignal(SIGINT);
    QObject::connect(KSignalHandler::self(), &KSignalHandler::signalReceived, &app, &QCoreApplication::quit);

    QString origin = ShellConfig::origin;
    QUrl startUrl{QString(ShellConfig::url)};
#ifdef IRIS_SHELL_TEST_HOOKS
    // Test builds only: point the shell at a local server.
    if (qEnvironmentVariableIsSet("IRIS_SHELL_ALLOWED_ORIGIN"))
        origin = qEnvironmentVariable("IRIS_SHELL_ALLOWED_ORIGIN");
    if (qEnvironmentVariableIsSet("IRIS_SHELL_START_URL"))
        startUrl = QUrl(qEnvironmentVariable("IRIS_SHELL_START_URL"));
#endif

    NavigationPolicy policy(origin);
#ifdef IRIS_SHELL_TEST_HOOKS
    if (qEnvironmentVariableIsSet("IRIS_SHELL_OPEN_LOG")) {
        const QString log = qEnvironmentVariable("IRIS_SHELL_OPEN_LOG");
        policy.setOpener([log](const QUrl &url) {
            QFile f(log);
            if (!f.open(QIODevice::Append))
                return false;
            f.write(url.toString().toUtf8() + '\n');
            return true;
        });
    }
#endif
    BridgeHost bridgeHost(&policy);
    NetworkWatch networkWatch;

    ShellInfo info;
    info.startUrl = startUrl;
    info.profileName = ShellConfig::profileName;
    info.dataPath = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + QStringLiteral("/webengine");
    info.cachePath = QStandardPaths::writableLocation(QStandardPaths::CacheLocation) + QStringLiteral("/webengine");
    info.downloadPath = QStandardPaths::writableLocation(QStandardPaths::DownloadLocation);
    info.bridgeScript = bridgeHost.injectedScript();
#ifdef IRIS_SHELL_TEST_HOOKS
    info.testHooks = true;
    if (qEnvironmentVariableIsSet("IRIS_SHELL_RETRY_MS"))
        info.retryIntervalMs = qEnvironmentVariableIntValue("IRIS_SHELL_RETRY_MS");
#endif
    QDir().mkpath(info.dataPath);
    QDir().mkpath(info.cachePath);

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty(QStringLiteral("shell"), &info);
    engine.rootContext()->setContextProperty(QStringLiteral("navPolicy"), &policy);
    engine.rootContext()->setContextProperty(QStringLiteral("bridgeHost"), &bridgeHost);
    engine.rootContext()->setContextProperty(QStringLiteral("networkWatch"), &networkWatch);
    engine.loadFromModule("House.Iris", "Main");
    if (engine.rootObjects().isEmpty())
        return 1;

    auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().constFirst());
    auto *state = new WindowState(window);
    state->restore();

    // A second launch lands here in the first process. Raise the window; the arguments are the
    // hook for matrix: links (mouseion/iris#69).
    QObject::connect(&service, &KDBusService::activateRequested, window, [window](const QStringList &arguments, const QString &) {
        Q_UNUSED(arguments)
#ifdef IRIS_SHELL_TEST_HOOKS
        qInfo("IRIS_STATE activate-requested");
#endif
        window->show();
        window->raise();
        window->requestActivate();
    });
    QObject::connect(&service, &KDBusService::activateActionRequested, window, [](const QString &, const QVariant &) {});

    if (!parser.positionalArguments().isEmpty()) {
        // matrix: URIs are parsed by a later ticket.
    }
    window->show();
    return app.exec();
}

#include "main.moc"
