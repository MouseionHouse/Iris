# Dev shell for the Iris desktop shell:  nix-shell desktop/shell.nix
# (the same inputs as the Nix package, nix/deps.nix)
{ pkgs ? import <nixpkgs> { } }:
let
  deps = import ./nix/deps.nix { inherit pkgs; };
in
pkgs.mkShell rec {
  inherit (deps) nativeBuildInputs buildInputs;
  # No wrapper runs in a dev shell, so Qt finds its plugins and QML modules through these.
  shellHook = ''
    export QT_PLUGIN_PATH=${pkgs.lib.makeSearchPath "lib/qt-6/plugins" buildInputs}
    export QML2_IMPORT_PATH=${pkgs.lib.makeSearchPath "lib/qt-6/qml" buildInputs}
    export QML_IMPORT_PATH=$QML2_IMPORT_PATH
    export QT_QPA_PLATFORM_PLUGIN_PATH=${pkgs.kdePackages.qtbase}/lib/qt-6/plugins/platforms
  '';
}
