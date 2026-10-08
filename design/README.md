# Design

This work's own design rounds: its name, its mark, its colours. The house, mouseion/design at `~/design`, owns only what every work of Mouseion shares: Night and Chalk, the three typefaces, the Voice. `house/` holds copies of those fonts and marks so a board stands alone.

- **A round** is one folder, `rounds/<date>-<subject>-<n>/`. Every option has an id (`A1`, `B2`: a letter per family) and is shown on Night and on Chalk, beside the name, and at 32 and 16 px.
- **Marks** are drawn as SVG on a 100-unit square by the round's `build.py`, once per ground, into `options/`.
- **Serve it** so John can open it from another machine: `python3 -m http.server 4892 --bind 0.0.0.0 --directory design`. A board's address is then `http://192.0.2.1:4892/rounds/<round>/`. Give it to him as a Markdown link.
- **Capture it** with `design/capture.sh design/rounds/<round>/<page>.html`, and look at the picture before showing it.
- **The ticket** for the name and the mark is the round's record: options by id, pictures, the pick.
