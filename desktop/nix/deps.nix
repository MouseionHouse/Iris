# What the shell is built from, for both nix/package.nix and ../shell.nix, so the two cannot drift.
{ pkgs }:
{
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
}
