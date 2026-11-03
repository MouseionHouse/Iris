# The nixpkgs the CI check builds against: the revision household/nix-config's flake.lock pins, so
# the check builds with the Qt and KDE Frameworks that Builder runs. Bump it when nix-config's moves.
import (builtins.fetchTarball {
  url = "https://github.com/NixOS/nixpkgs/archive/e7439b6b14ad3cc35d05608ebca9bce01a25f5f8.tar.gz";
  sha256 = "sha256-H83yz/do+hjOO0uujHyH8RgtIQP2v7Mw+cLwcZK/xKc=";
})
