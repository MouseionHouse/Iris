#include "badge.h"
#include "closetotray.h"
#include "colorscheme.h"
#include "globalshortcut.h"
#include "irisbridge.h"
#include "matrixuri.h"
#include "navigationpolicy.h"
#include "networkwatch.h"
#include "notifier.h"
#include "shellconfig.h"
#include "tray.h"
#include "windowstate.h"

#include <KDBusService>
#include <KSignalHandler>

#include <QAction>
#include <QApplication>
#include <QCommandLineParser>
#include <QDir>
#include <QFile>
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
    // QApplication, not QGuiApplication: the tray menu is a QMenu.
    QApplication app(argc, argv);
    // Closing the window hides it (CloseToTray); only Quit ends the app.
    app.setQuitOnLastWindowClosed(false);
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
    parser.addOption({QStringLiteral("hidden"), QStringLiteral("Start in the tray without showing the window.")});
    parser.addPositionalArgument(QStringLiteral("uri"), QStringLiteral("A matrix: link to open in Iris."), QStringLiteral("[uri]"));
    parser.process(app);

    KDBusService service(KDBusService::Unique);

    // Quit cleanly on SIGTERM/SIGINT so WebEngine flushes the profile (login, storage) to disk.
    KSignalHandler::self()->watchSignal(SIGTERM);
    KSignalHandler::self()->watchSignal(SIGINT);
    // Quitting has to get past close-to-tray, so every way out goes through quitShell.
    CloseToTray *closeToTray = nullptr;
    auto quitShell = [&closeToTray] {
        if (closeToTray)
            closeToTray->allowClose();
        QCoreApplication::quit();
    };
    QObject::connect(KSignalHandler::self(), &KSignalHandler::signalReceived, &app, [quitShell](int sig) {
#ifdef IRIS_SHELL_TEST_HOOKS
        if (sig == SIGUSR1)
            return; // handled below
#endif
        Q_UNUSED(sig)
        quitShell();
    });
#ifdef IRIS_SHELL_TEST_HOOKS
    // Test builds only: SIGUSR1 closes the window as the window manager's close button would.
    KSignalHandler::self()->watchSignal(SIGUSR1);
#endif

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

    QObject::connect(bridgeHost.bridge(), &IrisBridge::unreadChanged, &app, [](int total, int) { Badge::send(total); });
    Notifier notifier;
    QObject::connect(bridgeHost.bridge(), &IrisBridge::notifyRequested, &notifier, &Notifier::notify);
    QObject::connect(bridgeHost.bridge(), &IrisBridge::closeNotificationsRequested, &notifier, &Notifier::closeRoom);
    QObject::connect(&notifier, &Notifier::replyRequested, bridgeHost.bridge(), &IrisBridge::reply);
    ColorSchemeWatcher colorScheme;
    bool dark = colorScheme.dark();
#ifdef IRIS_SHELL_TEST_HOOKS
    // Test builds only: pretend Plasma is on a given scheme at start.
    if (qEnvironmentVariableIsSet("IRIS_SHELL_COLOR_SCHEME"))
        dark = qEnvironmentVariable("IRIS_SHELL_COLOR_SCHEME") == QLatin1String("dark");
#endif
    bridgeHost.bridge()->setColorScheme(dark);
    QObject::connect(&colorScheme, &ColorSchemeWatcher::darkChanged, bridgeHost.bridge(), &IrisBridge::setColorScheme);

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

    // Tray, close-to-tray and the global shortcut (mouseion/iris#67).
    closeToTray = new CloseToTray(window);
    auto *tray = new Tray(window, window);
    QObject::connect(tray, &Tray::quitRequested, &app, quitShell);
    QObject::connect(&app, &QGuiApplication::commitDataRequest, &app, [closeToTray] { closeToTray->allowClose(); });
    QObject::connect(closeToTray, &CloseToTray::hiddenToTray, tray, [tray](bool first) {
        if (first)
            tray->showStillRunningNotice();
    });
    QObject::connect(bridgeHost.bridge(), &IrisBridge::unreadChanged, tray, &Tray::setUnread);
    tray->setUnread(bridgeHost.bridge()->unreadTotal(), bridgeHost.bridge()->unreadHighlight());
    QAction *showHide = ShowHideShortcut::createShowHide(window);
    QObject::connect(showHide, &QAction::triggered, window, [window] { Tray::toggleWindow(window); });
#ifdef IRIS_SHELL_TEST_HOOKS
    QObject::connect(window, &QWindow::visibleChanged, &app, [](bool visible) { qInfo("IRIS_STATE visible=%s", visible ? "true" : "false"); });
    QObject::connect(KSignalHandler::self(), &KSignalHandler::signalReceived, window, [window](int sig) {
        if (sig == SIGUSR1)
            window->close();
    });
#endif

    // matrix: links (mouseion/iris#69), from the command line and from a second launch: parsed here,
    // dropped (and logged) if they do not parse, otherwise shown by the page. A link shows the window
    // even when it was started hidden. The bridge queues them until the page is up.
    auto showWindow = [window] {
        window->show();
        window->raise();
        window->requestActivate();
    };
    auto openLinks = [bridge = bridgeHost.bridge(), showWindow](const QStringList &candidates) {
        const QList<MatrixLink> links = matrixLinksFromArguments(candidates);
        for (const MatrixLink &link : links)
            bridge->openLink(link);
        if (!links.isEmpty()) {
#ifdef IRIS_SHELL_TEST_HOOKS
            qInfo("IRIS_STATE links-opened=%d", int(links.size()));
#endif
            showWindow();
        }
        return !links.isEmpty();
    };

    // A second launch lands here in the first process: raise the window and open its links.
    QObject::connect(&service, &KDBusService::activateRequested, window, [window, openLinks](const QStringList &arguments, const QString &) {
#ifdef IRIS_SHELL_TEST_HOOKS
        qInfo("IRIS_STATE activate-requested");
#endif
        window->show();
        window->raise();
        window->requestActivate();
        // The first argument is the program name.
        openLinks(arguments.mid(1));
    });
    QObject::connect(&service, &KDBusService::activateActionRequested, window, [](const QString &, const QVariant &) {});

    // A click on a notification: bring the window forward and have the page show the room.
    QObject::connect(&notifier, &Notifier::openRoomRequested, window, [window, bridge = bridgeHost.bridge()](const QString &roomId, const QString &eventId) {
#ifdef IRIS_SHELL_TEST_HOOKS
        qInfo("IRIS_STATE notification-activated");
#endif
        window->show();
        window->raise();
        window->requestActivate();
        bridge->openRoom(roomId, eventId);
    });

    // A link shows the window, even when the shell was started hidden; --hidden alone stays in the tray.
    openLinks(parser.positionalArguments());
    if (!parser.isSet(QStringLiteral("hidden")))
        window->show();
    return app.exec();
}

#include "main.moc"
