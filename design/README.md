# Design

This work's own design rounds: its name, its mark, its colours. The house, mouseion/design at `~/design`, owns only what every work of Mouseion shares: Night and Chalk, the three typefaces, the Voice. `house/` holds copies of those fonts and marks so a board stands alone.

- **A round** is one folder, `rounds/<date>-<subject>-<n>/`. Every option has an id (`A1`, `B2`: a letter per family) and is shown on Night and on Chalk, beside the name, and at 32 and 16 px.
- **Marks** are drawn as SVG on a 100-unit square by the round's `build.py`, once per ground, into `options/`.
- **Serve it** so John can open it from another machine: `python3 -m http.server 4892 --bind 0.0.0.0 --directory design`. A board's address is then `http://192.0.2.1:4892/rounds/<round>/`. Give it to him as a Markdown link.
- **Capture it** with `design/capture.sh design/rounds/<round>/<page>.html`, and look at the picture before showing it.
- **The ticket** for the name and the mark is the round's record: options by id, pictures, the pick.

## Decided

- **The mark (2026-10-08):** the Sketch, an iris with bare petals and the lower half of each fall a little darker, in P11 Amethyst and sea. It stands alone; the deep rounded square is for an app icon only. Artwork in `assets/` (`iris-mark-on-dark.svg`, `iris-mark-on-light.svg`, `iris-app-icon.svg`), values in `tokens.json`. Two other flowers are kept in `assets/kept/`.
- **The app's themes (2026-10-09):** Iris light and Iris dark in `src/colors.css.ts` put the flower's colors on the house grounds. The accent is the petals' amethyst (`iris-standard` on Night, `iris-fall` on Chalk, the one petal dark enough for white text), which also colors the unread counts for mentions and direct chats; the teal of the stem marks success. Text is set in Commissioner and the name Iris in Marcellus, the house typefaces. Inside the Hub the ground is the Hub's and the accent is still Iris's.

## Penpot

Iris has its own Penpot project, **Iris**, with one file, **Iris library** (at penpot.example.org, made 2026-10-09). Its `Foundations` page shows the mark and the app icon at their true sizes on Night and Chalk, the five colours, and the two kept alternates. The file's library holds the colours and three components: the mark on dark, the mark on light, and the app icon.

The repo is the source: when `assets/` or `tokens.json` changes, redraw the Penpot file from them. In the Penpot copy the stem is a filled shape, not a stroke, so the mark scales cleanly.
