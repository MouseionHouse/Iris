<p align="center">
  <img src="branding/iris-app-icon.svg" alt="The Iris mark: an iris flower" width="96" height="96">
</p>

# Iris

Iris is the chat of [Mouseion](https://forgejo.example.net/mouseion), our household's software. It is a [Matrix](https://matrix.org) client, forked from [Cinny](https://cinny.in) v4.12.6. The name is Homer's messenger in the Iliad, and the flower.

- **On the web:** [iris.example.org](https://iris.example.org), on its own or framed inside the Mouseion Hub.
- **On Android:** the app `house.mouseion.iris`, from the household F-Droid repo.
- **Tracker:** [issues on this repo](https://forgejo.example.net/mouseion/iris/issues).

It was called Mouseion Chat until 2026-10-09, and this repo was `mouseion/chat`.

## What Iris adds to Cinny

- **Sidebar sections on Home.** Starred and your own named sections mix chats and rooms; each has its own sort and filter, and they sync between your devices.
- **An Android app.** A Capacitor wrapper around the same web build, with push notifications while the app is closed (UnifiedPush and ntfy), a place in the share sheet, touch action sheets for messages, and safe areas for notched and folding screens. See [`mobile/WRAPPER-PLAN.md`](mobile/WRAPPER-PLAN.md).
- **A place in the Hub.** When the Hub frames Iris, the two talk over `postMessage`: the Hub sets the theme and receives the unread counts. See [`src/app/hub/`](src/app/hub).
- **Its own look.** The flower mark, and the Iris light and Iris dark themes built from its colors on the house grounds, set in the house typefaces.

Everything else is Cinny, and we follow it.

## Develop

Node 24 (the LTS, v24.13.1) is what CI uses.

```sh
npm ci      # install
npm start   # dev server
npm run build   # the web app, into dist/
```

Two pages draw real components on fake data, with no server needed: `/mock.html` (the Home page) and `/mock-message.html` (messages on a phone). Add `?dark` for the dark theme.

More on the code is in [`HACKING.md`](HACKING.md), which is Cinny's own guide and still applies.

## Build and release

One workflow does it all: [`.forgejo/workflows/build.yml`](.forgejo/workflows/build.yml). The comment at its top is the full account.

| A push to                       | Does                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| `dev`, touching the web app     | Builds the web image and deploys it to `iris.example.org` |
| `dev`, touching the Android app | Builds, signs and publishes a new Android version            |
| Any other branch                | Checks the build only                                        |

`dev` is the one trunk. Changes that touch only `design/` or docs build nothing.

Homeservers are set in [`config.json`](config.json) for the web and [`config.mobile.json`](config.mobile.json) for the Android app.

## Design

Iris owns its own design: the name, the mark and the colors were decided in rounds kept under [`design/`](design), and the record is [issue #12](https://forgejo.example.net/mouseion/iris/issues/12).

- [`branding/`](branding): the mark on dark, the mark on light, and the app icon, as SVG.
- [`design/tokens.json`](design/tokens.json): the five Iris colors.
- [`scripts/iris-icons.py`](scripts/iris-icons.py): cuts every icon the web app and the Android app use from `branding/`.
- [`src/colors.css.ts`](src/colors.css.ts): the Iris light and Iris dark themes.

The mark stands alone. The deep rounded square behind it is for app icons only.

## Following Cinny

Upstream is [cinnyapp/cinny](https://github.com/cinnyapp/cinny). [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) are Cinny's and describe contributing to Cinny, not to Iris. The files under `.github/` are Cinny's too and do not run here.

## License

Iris is a fork of Cinny and carries its license.

Cinny Project  
Copyright © 2024–present Ajay Bura  
https://cinny.in

Cinny is licensed under the GNU Affero General Public License, Version 3 of the License (AGPL-3.0-only). You may obtain a copy of the License at https://www.gnu.org/licenses/agpl-3.0.html

Changes made for Iris are under the same license. The source for the running app is this repo.
