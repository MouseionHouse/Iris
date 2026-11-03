import QtQuick
import QtQuick.Controls.Basic

Rectangle {
    id: page
    property string errorText: ""
    signal retryRequested

    readonly property bool dark: Qt.styleHints.colorScheme === Qt.Dark
    readonly property color ink: dark ? "#E8E6EE" : "#241B35"
    readonly property color quiet: dark ? "#A8A3B5" : "#625A72"
    readonly property color accent: "#8556CF"

    color: dark ? "#15161A" : "#FFFFFF"

    Column {
        anchors.centerIn: parent
        width: Math.min(parent.width - 48, 420)
        spacing: 14

        Image {
            source: "qrc:/iris/icon.svg"
            width: 72
            height: 72
            sourceSize: Qt.size(144, 144)
            anchors.horizontalCenter: parent.horizontalCenter
        }
        Label {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
            text: qsTr("Iris can't reach the server")
            color: page.ink
            font.family: "Inter"
            font.pixelSize: 22
            font.weight: Font.DemiBold
        }
        Label {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
            text: qsTr("Check your connection. Iris tries again by itself when the network is back.")
            color: page.quiet
            font.family: "Inter"
            font.pixelSize: 14
        }
        Label {
            width: parent.width
            visible: page.errorText !== ""
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
            text: page.errorText
            color: page.quiet
            font.family: "Inter"
            font.pixelSize: 12
        }
        Button {
            objectName: "retryButton"
            anchors.horizontalCenter: parent.horizontalCenter
            text: qsTr("Retry")
            onClicked: page.retryRequested()
            contentItem: Text {
                text: parent.text
                color: "#FFFFFF"
                font.family: "Inter"
                font.pixelSize: 14
                font.weight: Font.Medium
                horizontalAlignment: Text.AlignHCenter
                verticalAlignment: Text.AlignVCenter
            }
            background: Rectangle {
                implicitWidth: 112
                implicitHeight: 38
                radius: 8
                color: parent.down ? Qt.darker(page.accent, 1.2) : page.accent
                border.width: parent.visualFocus ? 2 : 0
                border.color: page.ink
            }
        }
    }
}
