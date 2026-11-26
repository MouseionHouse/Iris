# Releasing Iris

A public release puts the web app and the Android app (and the macOS app, once it can be built for
the public) on GitHub Releases, under a tag `vX.Y.Z`. It is made on the forge, by hand, with the
`release` workflow ([`.forgejo/workflows/release.yml`](../.forgejo/workflows/release.yml)); its
header describes every job.

## Before the first release

- **The token.** A fine-grained GitHub personal access token, with access to the public repository
  alone and one repository permission, **Contents: Read and write** (Metadata: Read-only comes with
  it). Store it as the forge repository's Actions secret `IRIS_GITHUB_RELEASE_TOKEN`. Only a real
  release reads it. A GitHub App with the same permission would do as well, but the workflow reads
  a token.
- **The macOS app** (optional). The macOS app opens one Iris web app, set when it is built. For a
  public release that has to be a public Iris, set as the repository variable
  `IRIS_RELEASE_DESKTOP_URL` (`https://host`). Without it a release has no macOS app.

## Making a release

1. **Write the notes** in `docs/releases/X.Y.Z.md`: what someone using Iris notices, one change a
   line, in the app's own words. Merge them into `dev`, and wait for `publish` to put that commit
   on the public `dev`.
2. **Dry run.** Actions → `release` → Run workflow, on `dev`, with the version and "Dry run" on (the
   default). It builds every file, scans them, and prints the tag, the release's body, and each
   file with its size and SHA-256, and sends nothing.
3. **Release.** The same, with "Dry run" off. A run that fails on GitHub after the forge's tag is
   made can be run again with the same version: it finds its own tag and goes on.

The version may be left empty: it is then the next one after the latest, from the commit messages
since it. It must be above every Iris version before it, the household's Android builds' included
([`.forgejo/scripts/iris-version.sh`](../.forgejo/scripts/iris-version.sh) is the scheme).

## What a release is built from

Only the repository's public defaults: `config.json`, `config.mobile.json`, and no hub origins.
The household's own build adds three things, and the release adds none of them:

| The household's build                                                              | Where                                                    | The release                                                             |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `IRIS_HUB_ORIGINS`, `IRIS_HUB_PREVIEW_PATTERN`: the hub that may frame the web app | `build.yml`, `bundle`, as Docker build arguments         | no build arguments: no hub                                              |
| `IRIS_CONFIG_MOBILE_JSON`: the Android app's config                                | `build.yml`, `bundle`, written over `config.mobile.json` | the repository's `config.mobile.json`, checked byte for byte in the app |
| `IRIS_DESKTOP_URL`: the Iris the macOS app opens                                   | `build.yml`, `macos`                                     | `IRIS_RELEASE_DESKTOP_URL`, or no macOS app                             |

The scan looks for each of those household settings in the files too, beside the publish guard's
private strings, patterns and gitleaks.
