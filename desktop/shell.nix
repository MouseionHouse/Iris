# Dev shell for the Iris desktop shell:  nix-shell desktop/shell.nix
# (the Nix package arrives with mouseion/iris#65)
{ pkgs ? import <nixpkgs> { } }:
pkgs.mkShell {
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
  shellHook = ''
    export QT_PLUGIN_PATH="''${QT_PLUGIN_PATH:-}"
    export QML2_IMPORT_PATH="''${QML2_IMPORT_PATH:-}"
  '';
}
