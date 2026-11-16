# Golden Ratio (app spec)

Status: **built, app 0.10.0 / backend 0.6.0 (2026-11-16)**. Planned and built in one chat with Isaac. Device checks: `docs/device-tests.md` section J.

## Checklist (charter section 10)
| # | Item | Decision |
|---|---|---|
| 1 | ID and name | `goldenratio` (reserved in Phase 1, kept so the address `#/app/goldenratio` never changes), "Golden Ratio" |
| 2 | Devices | Phone first. Also works on the tablet and in a computer browser (Grimoire counts any screen 700 px or wider as "tablet"), so `devices: ["phone", "tablet"]`. |
| 3 | Vault | Not now. Can be switched on later like any app (records are in the shared format). |
| 4 | Calendar feed | No (no dated items). |
| 5 | Sheet tabs | One: `goldenratio_history`. Columns: `Id, CreatedAt, UpdatedAt, SyncedAt, Deleted, SchemaVersion, Known, Typed, AUnit, BUnit, WholeUnit, AMm, BMm, WholeMm, Tape, Source`. |
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
- Normal: 1–9, 0, `.`, backspace, **tape measure** toggle, **Copy**, **Done**.
- **Tape measure on** (the ruler key turns gold): a row of ⅛ ¼ ⅜ ½ ⅝ ¾ ⅞ appears on top, `.` becomes `/`, and a **space** key appears. 3⅝ = `3` then `⅝`. 16ths and 32nds: `3` space `11` `/` `16`. A quick fraction replaces a fraction already at the end. Turning tape mode on while in a metric field switches that field to inches.
- **ft-in field:** a feet key `'` (in the bottom row normally, at the start of the fraction row in tape mode). 5' 3½" = `5` `'` `3` `½`. A bare number in ft-in is feet.
- **Results in tape mode:** in, ft and ft-in results are fractions to the nearest 1/32, reduced (8/32 shows as 1/4), with the exact 4-decimal value in small grey text beside it whenever the fraction is rounded. ft-in carries at the foot mark (never shows 12"). Metric results stay decimal.
- **Copy** shows a row: Copy a / b / a+b. The value goes to the clipboard with its unit (`2 1/4 in`, `161.8034 mm`, `3' 3 1/4"`).
- **Done** (or tapping the graphic, or scrolling the history) closes the pad and saves the calculation.
- **Computer keyboard** works while a field is active: digits, `.` (or `,`), `/`, space, `'`, Backspace; Enter or Esc = Done.

## Screens
| Screen | Top to bottom | How you get there |
|---|---|---|
| Default | history (as much as fits, newest at the bottom next to the graphic) > graphic > three fields | open the app; Done; tap the graphic |
| Typing | the newest history card > graphic > fields > number pad | tap a field |
| History | history fills the screen > graphic pinned at the bottom (fields hidden) | scroll (drag or mouse wheel) on the history |

- The graphic is identical on every screen: same size, a / b / a+b labels. Tapping it always goes to Default. No "tap to go back" text.
- Colors: a = Shrexy turquoise `#2FD9C0`, b = Shrexy red brightened to `#F0453F` (the original `#D00000` looked muddy as a thin line on grey), a+b = Shrexy white `#F4F7F6`. Gold `#E3B23C` only ever means "calculated"; typed values are white. Background `#3A3A3C`, cards `#2B2B2D`, number pad `#222224`.

## History
- **Synced to the Sheet and kept forever** (Isaac: "a log going back all the way to the beginning of time"), so it is the same on the phone and the computer.
- Saved when you press **Done**, leave the field (tap another field, the graphic, scroll the history), leave the app, or the app is hidden. **Never per keystroke.** Not saved again if it is the same as the newest card (same known field, typed text, units and tape mode), or after loading a card without changing it.
- Each card: box a (61.8% of the row, golden proportions) and box b on top, a+b across the full width below. White = typed, gold = calculated. Cards show the main value only (the exact decimal beside a fraction shows in the fields when you load the card). Long values shrink instead of being cut off.
- **Tap a card:** loads it back into the fields (values, units, tape mode). **Hold a value (half a second):** copies it. **Swipe a card left (History screen only):** Delete button. Deleting sets the Deleted flag in the Sheet; the row is never erased.

## Demo mode
- History screen, top of the list: **Try demo mode**. Shows 7 made-up calculations (every unit, tape mode, ft-in) and a gold banner "Demo mode: not saved to the Sheet". New calculations in demo mode go to the demo list only.
- **Clear demo data** (in the banner) deletes only demo records and leaves demo mode. **Leave demo mode** keeps the demo list for next time.
- Demo records live on the device only, under `grimoire:goldenratio:demo`; they can never reach the Sheet.

## Device-only vs synced
- Device only: session (units, tape mode, last-used time) `grimoire:goldenratio:session`; demo data `grimoire:goldenratio:demo`.
- Synced: history.

## Pop-up later (not built)
- `GoldenCalculator.jsx` is self-contained: it sizes itself to the box it is in (not the screen), keeps its own state, and reads and writes history through Grimoire's data layer. A projects app can later render `<GoldenCalculator source="projects" />` inside a pop-up panel with no change to the calculator. `source` is saved on each entry (`Source` column) so a project could list only its own calculations.
- When built: add a small connection file in `src/core/` (charter: cross-app connections), e.g. `openGoldenRatio({ unit }) -> Promise<value>`, and a "Use this value" button so a value drops straight into the project instead of copy and paste.
- Gotcha for then: the sync engine pulls the **open app's** collections every minute and every other app on the device about every 10 minutes, so history made inside the projects app reaches the Sheet right away (writes are always sent) but history made on another device would show up in the pop-up on the slower cycle. If that matters, have the connection call `sync.request("all")` when the pop-up opens.

## Files
`src/apps/goldenratio/`: `meta.js` (theme, icon, collections), `index.jsx`, `GoldenCalculator.jsx` (screens and state), `Graphic.jsx`, `Keypad.jsx`, `HistoryCard.jsx`, `math.js`, `units.js` (parse and format), `entry.js` (what each key does), `store.js` (history, demo, session), `schema.js` (Sheet columns), `tap.js`, `golden.css`, `icon.svg`. Backend: `apps-script/Grim_App_goldenratio.gs` plus one line in `Grim_Router.gs`.

## Decisions and reasons
- Own number pad instead of the iPhone's: the iOS decimal pad has no Done key, can't type fractions, and slides over the page instead of shrinking it, which made the requested layout fragile. Isaac chose the built-in pad.
- Tape mode as a toggle (not permanent fraction keys): Isaac's call, keeps the normal pad clean.
- Dark neutral grey, not Shrexy's teal or slate: Isaac didn't want a green tint.
- White a+b box: a gold box would make a calculated (gold) a+b value unreadable as "calculated". Isaac agreed.
- 30-minute unit reset instead of "until the app is closed": on iPhone, iOS decides when Grimoire closes, so the reset would have seemed random.
- History synced and kept forever (not device-only, not capped): Isaac wants it on the computer and the phone, and the data is tiny.
- Typed values stored as text: Sheets would turn `3/8` into March 8. Grimoire's backend already writes every column as plain text.
- Taps react to the finger lifting, not the browser's click: in testing, Chrome dropped the click of the first tap after a swipe, and the late click could land on whatever slid under the finger. The pad reacts on finger-down for speed and cancels the late click.

## Rejected ideas
- The phone's own number pad (see above).
- Dedicated fraction keys always shown (Isaac: only in tape mode).
- Gold a+b box (clashes with gold = calculated).
- Device-only or capped history; "Clear history" button.
- A "tap to go back" label on the graphic.
- The "…" menus from the reference screenshot.

## Gotchas
- iOS can ignore the page's no-zoom rules; this app has no text boxes, so the zoom-on-focus problem does not apply.
- A history value is the typed text for the known field, so it shows exactly what was typed (e.g. `6' 8` without an inch mark).
- In ft-in, a bare number is feet. In any other unit, a value containing `'` is read as feet and inches.

## Open questions
- None at build time.
