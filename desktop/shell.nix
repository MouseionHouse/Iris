# Dev shell for the Iris desktop shell:  nix-shell desktop/shell.nix
# (the Nix package arrives with mouseion/iris#65)
{ pkgs ? import <nixpkgs> { } }:
pkgs.mkShell rec {
  nativeBuildInputs = with pkgs; [
    cmake
    ninja
    pkg-config
    kdePackages.extra-cmake-modules
    kdePackages.wrapQtAppsHook
  ];
  buildInputs = with pkgs.kdePackages; [
    qtbase
    qtdeclarative
    qtwebengine
    qtwebchannel
    qtwayland
    kconfig
    kcoreaddons
    kdbusaddons
  ];
  # No wrapper runs in a dev shell, so Qt finds its plugins and QML modules through these.
  shellHook = ''
    export QT_PLUGIN_PATH=${pkgs.lib.makeSearchPath "lib/qt-6/plugins" buildInputs}
    export QML2_IMPORT_PATH=${pkgs.lib.makeSearchPath "lib/qt-6/qml" buildInputs}
    export QML_IMPORT_PATH=$QML2_IMPORT_PATH
    export QT_QPA_PLATFORM_PLUGIN_PATH=${pkgs.kdePackages.qtbase}/lib/qt-6/plugins/platforms
  '';
}
