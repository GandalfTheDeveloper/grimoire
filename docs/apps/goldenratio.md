# Golden Ratio (app spec)

Status: **app 0.11.0 / backend 0.7.0 (2026-11-16)**. Built in 0.10.0 / 0.6.0; round 2 (0.11.0) added scrolling back down to the fields, clearing, and the app's own settings. Device checks: `docs/device-tests.md` sections J and K.

## Checklist (charter section 10)
| # | Item | Decision |
|---|---|---|
| 1 | ID and name | `goldenratio` (reserved in Phase 1, kept so the address `#/app/goldenratio` never changes), "Golden Ratio" |
| 2 | Devices | Phone first. Also works on the tablet and in a computer browser (Grimoire counts any screen 700 px or wider as "tablet"), so `devices: ["phone", "tablet"]`. |
| 3 | Vault | Not now. Can be switched on later like any app (records are in the shared format). |
| 4 | Calendar feed | No (no dated items). |
| 5 | Sheet tabs | `goldenratio_history`. Columns: `Id, CreatedAt, UpdatedAt, SyncedAt, Deleted, SchemaVersion, Known, Typed, AUnit, BUnit, WholeUnit, AMm, BMm, WholeMm, Tape, Source`. `goldenratio_settings` (0.11.0): one row, Id `goldenratio-settings`. Columns: the six envelope columns, then `HideDemo` (TRUE/FALSE), `CopyUnit` (`keep`/`drop`; blank = keep). |
| 6 | Cross-app | Built to open later as a pop-up inside another app (see "Pop-up later"). Nothing built for it yet. |
| 7 | Files/photos | No. |
| 8 | Theme | Neutral grey (no green tint) with Super Shrexy's gold, turquoise, red and white. In `meta.js`. |
| 9 | Spec | This file. |
| 10 | Index | Charter v1.6 app index row added (Isaac's OK, 2026-11-16). |

## What it does
- Three fields: **Longer section (a)**, **Shorter section (b)**, **Whole (a + b)**. Type in any one; the other two are worked out live as you type. φ = (1 + √5) / 2.
  - from a: b = a ÷ φ, a+b = a × φ
  - from b: a = b × φ, a+b = b × φ²
  - from a+b: a = (a+b) ÷ φ, b = (a+b) ÷ φ²
- **The field you typed in is the known value (white); the other two are calculated (gold).** Tapping a gold field makes it the known value: it starts filled in with its current value and the first key replaces it. While a value is half-typed ("3 5/"), the last good answer stays on screen.
- Everything is worked out in millimetres at full precision; rounding is only on screen. Results show up to 4 decimals with trailing zeros dropped (`100`, not `100.0000`).
- **Units on each field:** mm, cm, m, in, ft, ft-in. Default mm. Each result is converted into the unit chosen on its own field.
  - Changing the unit of a **gold** field re-expresses the same length.
  - Changing the unit of **your own** field keeps your number and recalculates (you probably picked the wrong unit). A feet-and-inches value moved to a single unit is converted, since `5' 3` means nothing in mm. This counts as a new calculation in history.
- **Units (and tape mode) stay until 30 minutes without use**, then go back to mm (and tape mode off). Stored on the device with a time stamp, so it works whether iOS keeps Grimoire running or closes it. Checked once a minute while open and on every open. "Use" = tapping a field or a key, or changing a unit.

## Number pad (the phone's keyboard never opens)
- Normal: 1–9, 0, `.` on the left; on the right one column of five keys: **tape measure** toggle, **Copy**, **Clear**, backspace, **Done** (0.11.0: the right column went from four keys to five, so those keys are a little shorter than the digits).
- **Clear** (0.11.0) empties all three fields and keeps the pad open on the same field, ready for a new value. The calculation on screen is saved to history first, so nothing is lost. Units and tape mode are not touched. On a computer keyboard, **Delete** does the same.
- **Tape measure on** (the ruler key turns gold): a row of ⅛ ¼ ⅜ ½ ⅝ ¾ ⅞ appears on top, `.` becomes `/`, and a **space** key appears. 3⅝ = `3` then `⅝`. 16ths and 32nds: `3` space `11` `/` `16`. A quick fraction replaces a fraction already at the end. Turning tape mode on while in a metric field switches that field to inches.
- **ft-in field:** a feet key `'` (in the bottom row normally, at the start of the fraction row in tape mode). 5' 3½" = `5` `'` `3` `½`. A bare number in ft-in is feet.
- **Results in tape mode:** in, ft and ft-in results are fractions to the nearest 1/32, reduced (8/32 shows as 1/4), with the exact 4-decimal value in small grey text beside it whenever the fraction is rounded. ft-in carries at the foot mark (never shows 12"). Metric results stay decimal.
- **Copy** shows a row: Copy a / b / a+b. The value goes to the clipboard with its unit (`2 1/4 in`, `161.8034 mm`, `3' 3 1/4"`), or without it (`161.8034`) when **Copy the unit too** is off in settings. ft-in keeps its `'` and `"` marks either way (they are part of the value).
- **Done** (or tapping the graphic, or scrolling the history) closes the pad and saves the calculation. Done keeps the values on screen; the graphic clears them.
- **Computer keyboard** works while a field is active: digits, `.` (or `,`), `/`, space, `'`, Backspace, Delete = Clear; Enter or Esc = Done.

## Screens
| Screen | Top to bottom | How you get there |
|---|---|---|
| Default | history (as much as fits, newest at the bottom next to the graphic) > graphic > three fields | open the app; Done; tap the graphic (also clears the fields); scroll back down from the History screen |
| Typing | the newest history card > graphic > fields > number pad | tap a field |
| History | history fills the screen > graphic pinned at the bottom (fields hidden) | scroll **up** into the history (drag down, or mouse wheel up) |

- **Back to the fields by scrolling (0.11.0):** on the History screen, scroll down to the newest card and keep pulling (finger moves up about 40 px more, past the end). Only counts when the list is **already at the bottom when the drag starts**, so a fast fling that just arrives at the bottom doesn't throw you out of the history; a second short pull does it. Mouse wheel: at the bottom, after a pause of 0.3 s, one more tick down. Scrolling back does not clear the fields.
- Since 0.11.0 only scrolling **up** (toward older cards) opens the History screen. Before, a drag in either direction did, which would have fought with "scroll down to go back".
- **Tapping the graphic clears every field (0.11.0)** and goes to Default, from any screen. The calculation on screen is saved to history first (unless it is the same as the newest card, e.g. a card you just loaded), so it can always be tapped back from the history. Units and tape mode stay.
- The graphic is identical on every screen: same size, a / b / a+b labels. No "tap to go back" text.
- Colors: a = Shrexy turquoise `#2FD9C0`, b = Shrexy red brightened to `#F0453F` (the original `#D00000` looked muddy as a thin line on grey), a+b = Shrexy white `#F4F7F6`. Gold `#E3B23C` only ever means "calculated"; typed values are white. Background `#3A3A3C`, cards `#2B2B2D`, number pad `#222224`.

## History
- **Synced to the Sheet and kept forever** (Isaac: "a log going back all the way to the beginning of time"), so it is the same on the phone and the computer.
- Saved when you press **Done**, leave the field (tap another field, the graphic, scroll the history), leave the app, or the app is hidden. **Never per keystroke.** Not saved again if it is the same as the newest card (same known field, typed text, units and tape mode), or after loading a card without changing it.
- Each card: box a (61.8% of the row, golden proportions) and box b on top, a+b across the full width below. White = typed, gold = calculated. Cards show the main value only (the exact decimal beside a fraction shows in the fields when you load the card). Long values shrink instead of being cut off.
- **Tap a card:** loads it back into the fields (values, units, tape mode). **Hold a value (half a second):** copies it. **Swipe a card left (History screen only):** Delete button. Deleting sets the Deleted flag in the Sheet; the row is never erased.

## Settings (0.11.0)
- **Gear in the top bar** while Golden Ratio is open (Grimoire's own settings stay on the home screen's gear). Opens **Golden Ratio settings** as a panel over the calculator, which stays open underneath, so a half-typed value is still there afterwards. The back arrow closes the panel; a second back leaves the app.
- **Show "Try demo mode"** (default on). Off hides the link at the top of the history. If demo mode is already on, **Leave demo mode** and **Clear demo data** still show, so you can never get stuck in it.
- **Copy the unit too** (default on). Off copies just the number, for the Copy key and for holding a history value.
- **Synced** (Isaac's choice, charter: settings meant to match across devices go through the Sheet): one record in `goldenratio_settings`, newest change wins. Not part of demo mode; demo mode never touches it.
- The shell part is generic: any app can add `settings: () => import("./Settings.jsx")` to its `meta.js` and gets the gear and panel (see `docs/shell.md`).

## Demo mode
- History screen, top of the list: **Try demo mode** (can be hidden in settings). Shows 7 made-up calculations (every unit, tape mode, ft-in) and a gold banner "Demo mode: not saved to the Sheet". New calculations in demo mode go to the demo list only.
- **Clear demo data** (in the banner) deletes only demo records and leaves demo mode. **Leave demo mode** keeps the demo list for next time.
- Demo records live on the device only, under `grimoire:goldenratio:demo`; they can never reach the Sheet.

## Device-only vs synced
- Device only: session (units, tape mode, last-used time) `grimoire:goldenratio:session`; demo data `grimoire:goldenratio:demo`.
- Synced: history, settings (show "Try demo mode", copy the unit too).

## Pop-up later (not built)
- `GoldenCalculator.jsx` is self-contained: it sizes itself to the box it is in (not the screen), keeps its own state, and reads and writes history through Grimoire's data layer. A projects app can later render `<GoldenCalculator source="projects" />` inside a pop-up panel with no change to the calculator. `source` is saved on each entry (`Source` column) so a project could list only its own calculations.
- When built: add a small connection file in `src/core/` (charter: cross-app connections), e.g. `openGoldenRatio({ unit }) -> Promise<value>`, and a "Use this value" button so a value drops straight into the project instead of copy and paste.
- Gotcha for then: the sync engine pulls the **open app's** collections every minute and every other app on the device about every 10 minutes, so history made inside the projects app reaches the Sheet right away (writes are always sent) but history made on another device would show up in the pop-up on the slower cycle. If that matters, have the connection call `sync.request("all")` when the pop-up opens.

## Files
`src/apps/goldenratio/`: `meta.js` (theme, icon, collections, settings), `index.jsx`, `GoldenCalculator.jsx` (screens and state), `Graphic.jsx`, `Keypad.jsx`, `HistoryCard.jsx`, `math.js`, `units.js` (parse and format), `entry.js` (what each key does), `store.js` (history, demo, session), `settings.js` (synced settings, one shared copy in memory), `Settings.jsx` (the settings panel), `schema.js` (Sheet columns), `tap.js`, `golden.css`, `icon.svg`. Backend: `apps-script/Grim_App_goldenratio.gs` (tabs `history`, `settings`) plus one line in `Grim_Router.gs`.

## Decisions and reasons
- Own number pad instead of the iPhone's: the iOS decimal pad has no Done key, can't type fractions, and slides over the page instead of shrinking it, which made the requested layout fragile. Isaac chose the built-in pad.
- Tape mode as a toggle (not permanent fraction keys): Isaac's call, keeps the normal pad clean.
- Dark neutral grey, not Shrexy's teal or slate: Isaac didn't want a green tint.
- White a+b box: a gold box would make a calculated (gold) a+b value unreadable as "calculated". Isaac agreed.
- 30-minute unit reset instead of "until the app is closed": on iPhone, iOS decides when Grimoire closes, so the reset would have seemed random.
- History synced and kept forever (not device-only, not capped): Isaac wants it on the computer and the phone, and the data is tiny.
- Typed values stored as text: Sheets would turn `3/8` into March 8. Grimoire's backend already writes every column as plain text.
- Taps react to the finger lifting, not the browser's click: in testing, Chrome dropped the click of the first tap after a swipe, and the late click could land on whatever slid under the finger. The pad reacts on finger-down for speed and cancels the late click.

- Round 2 (0.11.0), Isaac's requests: scroll back down to reach the fields; the graphic clears the fields; a Clear key on the pad; a settings gear with "remove Try demo mode" and "copy the unit or not".
- Clear saves to history first instead of discarding: clearing then never loses a calculation, and it is consistent with every other way of leaving a value.
- Clear key placed in the right-hand column (above backspace, the usual calculator spot) rather than in the empty bottom-row slot: that slot is taken by space or ' in tape and ft-in modes, so Clear would have moved around.
- Settings synced rather than device-only: Isaac's choice; costs one Apps Script update (backend 0.7.0).
- `CopyUnit` stored as `keep`/`drop` text, not TRUE/FALSE: a blank cell must mean the default (with unit), and a blank bool reads as FALSE.
- Settings live in memory once for the whole page (not per screen), so the panel and the calculator underneath change at the same moment.

## Rejected ideas
- The phone's own number pad (see above).
- Dedicated fraction keys always shown (Isaac: only in tape mode).
- Gold a+b box (clashes with gold = calculated).
- Device-only or capped history; "Clear history" button.
- A "tap to go back" label on the graphic.
- The "…" menus from the reference screenshot.
- Settings as their own page (route): leaving the calculator would have wiped a half-typed value.
- Hiding "Leave demo mode" along with "Try demo mode": you could get stuck in demo mode.

## Gotchas
- Backend before app: an app on 0.11.0 against backend 0.6.0 keeps syncing history normally, but the settings record is refused (`unknown_collection`) and waits on the device (amber dot) until backend 0.7.0 is deployed. Nothing is lost.
- On the typing screen only the newest card shows, so "did Clear save it?" is checked on the Default screen or in the Sheet, not by counting cards while typing.
- iOS can ignore the page's no-zoom rules; this app has no text boxes, so the zoom-on-focus problem does not apply.
- A history value is the typed text for the known field, so it shows exactly what was typed (e.g. `6' 8` without an inch mark).
- In ft-in, a bare number is feet. In any other unit, a value containing `'` is read as feet and inches.

## Open questions
- None at build time.
