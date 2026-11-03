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

    function retry() {
        if (webView.url.toString() === "")
            webView.url = shell.startUrl
        else
            webView.reload()
    }

    WebEngineProfile {
        id: profile
        storageName: shell.profileName
        offTheRecord: false
        persistentStoragePath: shell.dataPath
        cachePath: shell.cachePath
        persistentCookiesPolicy: WebEngineProfile.ForcePersistentCookies
        downloadPath: shell.downloadPath
        onDownloadRequested: download => {
            download.downloadDirectory = shell.downloadPath
            download.accept()
        }
    }

    WebEngineView {
        id: webView
        objectName: "webView"
        anchors.fill: parent
        profile: profile
        webChannel: bridgeChannel
        url: shell.startUrl
        settings.errorPageEnabled: false
        settings.javascriptCanOpenWindows: true

        userScripts: [
            WebEngineScript {
                name: "irisDesktopBridge"
                sourceCode: shell.bridgeScript
                injectionPoint: WebEngineScript.DocumentCreation
                worldId: WebEngineScript.MainWorld
                runsOnSubFrames: false
            }
        ]

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
            // Iris's own web notifications keep working until the notifications ticket replaces them.
            if (permission.permissionType === WebEnginePermission.PermissionType.Notifications)
                permission.grant()
            else
                permission.deny()
        }

        onLoadingChanged: info => {
            if (info.status === WebEngineView.LoadSucceededStatus) {
                win.offline = false
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
