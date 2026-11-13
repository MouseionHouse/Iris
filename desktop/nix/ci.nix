# What the `desktop` CI job builds (mouseion/iris#79): the package against the nixpkgs that
# household/nix-config's `main` locks for its root `nixpkgs` input. `lock` is that flake.lock,
# fetched by the job. The node is found by following root → inputs.nixpkgs, never by its name
# (it is `nixpkgs_2` today), and fetched from its `locked` attributes, so the source is verified
# by narHash. Local builds use <nixpkgs>; see ../README.md, "Nix package".
#
#   nix-build desktop/nix/ci.nix -A package --arg lock /path/to/flake.lock
{ lock }:
let
  flakeLock = builtins.fromJSON (builtins.readFile lock);
  input = flakeLock.nodes.${flakeLock.root}.inputs.nixpkgs;
  # A root input that `follows` another is a list, not a node name.
  node =
    if builtins.isString input then
      input
    else
      throw "nix-config's root nixpkgs input follows ${builtins.toJSON input}; expected a node of its own";
  locked = flakeLock.nodes.${node}.locked;
  pkgs = import (builtins.fetchTree locked) { };
in
{
  # A neutral URL: the check builds and tests the shell, it does not ship it.
  package = pkgs.callPackage ./package.nix { url = "https://iris.example.org"; };

  # One line for the job's log: what this check builds against.
  nixpkgs =
    "node ${node}, ${locked.type}"
    + (if locked ? owner then " ${locked.owner}/${locked.repo}" else "")
    + " rev ${locked.rev or "(none)"} narHash ${locked.narHash}";
}
