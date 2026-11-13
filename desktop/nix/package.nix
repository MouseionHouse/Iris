# The Iris desktop shell, callPackage-style, no flake (mouseion/iris#65). household/nix-config
# builds it against its own nixpkgs; see ../README.md, "Nix".
#
#   callPackage <iris>/desktop/nix/package.nix { url = "https://iris.example.org"; }
#
# `url` is required: the Iris web app the shell opens and the one origin it trusts, as
# https://host[:port] (CMake's IRIS_URL).
# `source` defaults to this repo's desktop/ directory plus the branding/ artwork it embeds (the shell
# is built from desktop/ with ../branding/ beside it).
{
  lib,
  stdenv,
  pkgs,
  url ? null,
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
assert lib.assertMsg (url != null)
  "iris-desktop: pass `url`, the Iris web app the shell opens, e.g. callPackage .../desktop/nix/package.nix { url = \"https://iris.example.org\"; }";
stdenv.mkDerivation {
  pname = "iris-desktop";
  version = "0.1.0";
  src = source;
  sourceRoot = "${source.name}/desktop";

  inherit (deps) nativeBuildInputs buildInputs;

  # The test option stays off: it lets environment variables repoint the shell, which a shipped
  # binary must not allow.
  cmakeFlags = [
    (lib.cmakeFeature "IRIS_URL" url)
    (lib.cmakeBool "IRIS_SHELL_TEST_HOOKS" false)
    # The notifier test runs on a bus of its own; the sandbox has no /etc/dbus-1.
    (lib.cmakeFeature "IRIS_DBUS_SESSION_CONFIG" "${pkgs.dbus}/share/dbus-1/session.conf")
  ];

  # The Qt Test suites need a platform plugin but no display (and, for the notifier, a private bus).
  doCheck = true;
  checkPhase = ''
    runHook preCheck
    export HOME=$TMPDIR QT_QPA_PLATFORM=offscreen
    ctest --output-on-failure
    runHook postCheck
  '';

  meta = {
    description = "Iris Matrix client for KDE Plasma";
    mainProgram = "iris";
    platforms = lib.platforms.linux;
  };
}
