import QtQuick
import QtQuick.Controls.Basic
import QtWebEngine
import QtWebChannel

ApplicationWindow {
    id: win
    objectName: "mainWindow"
    width: 1100
    height: 760
    minimumWidth: 360
    minimumHeight: 400
    visible: false
    title: !offline && webView.title ? webView.title : "Iris"

    property bool offline: false
    property string errorText: ""

    onOfflineChanged: if (shell.testHooks) console.log("IRIS_STATE offline=" + offline)

    function retry() {
        if (webView.url.toString() === "")
            webView.url = shell.startUrl
        else
            webView.reload()
    }

    // Named and on disk: login, localStorage, IndexedDB and the service worker survive restarts.
    WebEngineProfilePrototype {
        id: profilePrototype
        storageName: shell.profileName
        persistentStoragePath: shell.dataPath
        cachePath: shell.cachePath
        persistentCookiesPolicy: WebEngineProfile.ForcePersistentCookies
    }

    Connections {
        target: webView.profile
        function onDownloadRequested(download) {
            download.downloadDirectory = shell.downloadPath
            download.accept()
        }
    }

    WebChannel {
        id: channel
        Component.onCompleted: bridgeHost.useChannel(channel)
    }

    WebEngineView {
        id: webView
        objectName: "webView"
        anchors.fill: parent
        webChannel: channel
        settings.errorPageEnabled: false
        settings.javascriptCanOpenWindows: true

        Component.onCompleted: {
            // Set here, before the first load: as a binding it crashes inside setProfile.
            profile = profilePrototype.instance()
            var script = WebEngine.script()
            script.name = "irisDesktopBridge"
            script.sourceCode = shell.bridgeScript
            script.injectionPoint = WebEngineScript.DocumentCreation
            script.worldId = WebEngineScript.MainWorld
            script.runsOnSubFrames = false
            userScripts.collection = [script]
            url = shell.startUrl
        }

        onNavigationRequested: request => {
            if (!request.isMainFrame)
                return
            // The one load the shell starts itself.
            if (request.url === shell.startUrl && request.navigationType === WebEngineNavigationRequest.TypedNavigation) {
                bridgeHost.pageUrlChanged(request.url)
                return
            }
            if (navPolicy.isAllowed(request.url)) {
                bridgeHost.pageUrlChanged(request.url)
            } else {
                request.action = WebEngineNavigationRequest.IgnoreRequest
                navPolicy.openExternal(request.url)
            }
        }
        onNewWindowRequested: request => navPolicy.openExternal(request.requestedUrl)
        onUrlChanged: bridgeHost.pageUrlChanged(url)

        onPermissionRequested: permission => {
            // Iris shows its notifications through the shell (irisDesktop.notify); the grant keeps the
            // page's own notification setting from reading "blocked".
            if (permission.permissionType === WebEnginePermission.PermissionType.Notifications)
                permission.grant()
            else
                permission.deny()
        }

        onLoadingChanged: info => {
            if (info.status === WebEngineView.LoadSucceededStatus) {
                win.offline = false
                bridgeHost.pageLoaded(webView.url)
            } else if (info.status === WebEngineView.LoadFailedStatus) {
                // -3 is ERR_ABORTED: a navigation we cancelled or replaced, not a failure.
                if (info.errorCode === -3)
                    return
                win.errorText = info.errorString
                win.offline = true
            }
        }
    }

    OfflinePage {
        anchors.fill: parent
        visible: win.offline
        errorText: win.errorText
        onRetryRequested: win.retry()
    }

    Connections {
        target: networkWatch
        function onBecameOnline() {
            if (win.offline)
                win.retry()
        }
    }

    // Covers networks the reachability backend cannot see (a server that is down, a VPN coming up).
    Timer {
        interval: shell.retryIntervalMs
        repeat: true
        running: win.offline
        onTriggered: win.retry()
    }
}
