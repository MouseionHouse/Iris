# Home on a phone, round 1 (2026-10-09)

This round redesigns the Home page for phones. It asks one question: **what shape should Home take on a phone?** It is a prototype, not the build.

- **Open it:** `npx vite --host 0.0.0.0 --port 4894`, then `/mock-home-phone.html`. On a desktop it shows the four side by side. On a phone, or with `?variant=now|a|b|c`, it shows one full screen with a strip on top to flip between them. `?dark` and `?light` override the system setting.
- **The code:** `src/mock/home-phone.tsx`. Real folds components and the app's own unread badge, on fake rooms. Sections fold, the filters in B work, and + opens the create sheet. Nothing is wired to a server.
- **Pictures:** `captures/`.

## What is hard on a phone today (Now)

- The rail takes 66 of 412 px, a sixth of the width, for six buttons, and its top ones are the furthest from a thumb.
- Four action rows (Create Room, Create Chat, Join with Address, Message Search) sit above the first conversation.
- Rows are 36 px tall and the section buttons 24 px; Android's guidance for a touch target is 48.
- A row shows a name and a count, with no last message and no time.

## The options

| Id  | Name             | Shape                                                                                                                                                                                                                   |
| --- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Now | Home as it ships | Rail on the left, four action rows, one line per conversation                                                                                                                                                           |
| A   | Bottom bar       | The rail becomes a bar along the bottom (Home, Direct, Explore, Inbox, You). Sections stay and fold. Rows show the last message and the time. One + button opens the create actions as a sheet. Search is in the header |
| B   | One list         | No rail and no bar. Search is the top of the screen, with Inbox and the account in it. Sections become filters. Everything is one list, newest first                                                                    |
| C   | Rail kept        | The smallest change. The rail stays, slimmer. The action rows fold into Search and + in the header. Rows are one line, 48 px                                                                                            |

## Not in this round

- Where spaces go. A hints at it with the arrow beside "Home"; B and C do not show it.
- Motion beyond the folds, the sheet and the pressed states. The build of the picked shape gets it.
- The unfolded Fold and tablets.

## The pick (2026-10-12)

**A, with B's chips.** The bar is Home, DMs, Activity, Search, You. Sections stay and fold; a chip row (All, Unread, Mentions) sits above them. Unfolded, the Fold shows two panes.

Settled alongside it:

- **Spaces:** the "Home" title opens a sheet with Home, each space and Add space.
- **Explore:** a row in the + sheet, beside Join with Address.
- **The breakpoint:** 680, down from 750. A Galaxy Z Fold is 411 px wide folded and about 750 px unfolded (1968 px at 420 dpi), which the old "750 or less" rule treated as a phone. At 680 the room pane is never narrower than 358 px beside the 66 px rail and the 256 px list.
- **Names:** the phone says DMs and Activity; desktop keeps Direct Messages and Inbox.
