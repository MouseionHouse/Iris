# The Iris desktop shell, callPackage-style, no flake (mouseion/iris#65). household/nix-config
# builds it against its own nixpkgs; see ../README.md, "Nix".
#
#   callPackage <iris>/desktop/nix/package.nix { }
#
# `source` defaults to this repo's desktop/ directory plus the branding/ artwork it embeds (the shell
# is built from desktop/ with ../branding/ beside it).
{
  lib,
  stdenv,
  pkgs,
  source ? lib.fileset.toSource {
    root = ../..;
    fileset = lib.fileset.unions [
      ../../desktop
      ../../branding
    ];
  },
}:
let
  deps = import ./deps.nix { inherit pkgs; };
in
stdenv.mkDerivation {
  pname = "iris-desktop";
  version = "0.1.0";
  src = source;
  sourceRoot = "${source.name}/desktop";

  inherit (deps) nativeBuildInputs buildInputs;

  # The test option stays off: it lets environment variables repoint the shell, which a shipped
  # binary must not allow.
  cmakeFlags = [ (lib.cmakeBool "IRIS_SHELL_TEST_HOOKS" false) ];

  # The Qt Test suites need a platform plugin but no display.
  doCheck = true;
  checkPhase = ''
    runHook preCheck
    export HOME=$TMPDIR QT_QPA_PLATFORM=offscreen
    ctest --output-on-failure
    runHook postCheck
  '';

  meta = {
    description = "Iris, the house Matrix client, as a KDE app";
    mainProgram = "iris";
    platforms = lib.platforms.linux;
  };
}
