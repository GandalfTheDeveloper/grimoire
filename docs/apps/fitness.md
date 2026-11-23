# Super Shrexy (fitness tracker): app spec (Phase 2, 2b, 2c and the 0.9.0 round)

Source of truth for how Fitness lives inside Grimoire. The full feature history, data model and gotchas of the original tracker are in the project's Handoff doc (`Grimoire-Handoff-Super-Shrexy-Tracker-Calendar.md`). This file covers what changed when it moved in (Phase 2, app 0.5.0).

## Checklist (charter section 10)
1. ID and name: `fitness`, shown as **"Super Shrexy"** since 0.7.0 (it was "Fitness"). Only the name changed: the ID, storage keys and route stay `fitness`.
2. Devices: phone (entry screen) and tablet (wall display). Same 700 px cut-off as before.
3. Vault: no (can be enabled later; not before it follows the "all reads and writes go through core" rule, see Fix later).
4. Calendar feed: not yet (its own Week and Month views still live inside the app).
5. Sheet tabs: unchanged and still the old ones: `PlanDays`, `PlanExercises`, `DailyLog`, `ExerciseLog`, `RunLog`, `CalendarNotes`. Not touched.
6. Cross-app connections: none.
7. Files and photos: none.
8. Theme: Shrexy teal (`meta.js`). The palette is still hard-coded inside `WorkoutTracker.jsx`.
9. This file. 10. Listed in the charter's app index.

## What changed in the move (and nothing else)
| Charter item | What was done |
|---|---|
| Prefix storage | `storeGet` / `storeSet` now go through `core/storage.js`. Every key is `grimoire:fitness:<name>` (`settings`, `dailyLog`, `exerciseLog`, `runLog`, `queue`, `calendarNotes`, `planOverrides`). The `window.storage` branch is gone. Old unprefixed keys from the old Shrexy site are never read, written or deleted. |
| Start and stop timers on mount | Already cleaned up in `useEffect` returns (refresh interval, slideshow, autosave, long-press, exercise timers, wake lock, key and visibility listeners). A test now proves nothing is left running after you go back Home. Added: after close, no further reads from the Sheet are started (`mountedRef`). |
| Full-height container | `height: 100vh` became `flex: 1; minHeight: 0` inside Grimoire's app frame. Modals still use `position: absolute; inset: 0` against the Fitness root, which is still `position: relative`. |
| Header becomes sub-header | The "Super Shrexy Tracker" title is gone (Grimoire's top bar shows "Fitness"). The sub-header keeps the sync message, sync icon, phone/monitor toggle and gear. The safe-area top padding was dropped (the top bar already clears the status bar). The app's own full-screen button was removed: Grimoire's top bar already has one. |

## Added beyond the four items, and why
- **Last-chance send.** When Fitness is hidden or closed, anything still in the queue is sent once with a `keepalive` request (charter "Saving" rule 3). The queue is only cleared by a confirmed normal sync, never by this send. Writes are upserts, so a repeat is harmless (tested: one row, not two). Reason: nesting makes it easy to leave the app mid-edit, and old Shrexy never had to cope with that.

## App 0.7.0 (included in 0.8.0)
- **Name and icon:** "Super Shrexy" with the original teal "S" icon (`src/apps/fitness/icon.png`, the 512 px file from the old app) on the home tile. `meta.js` has `iconSrc`; the shell tile shows it instead of a line icon when present.
- **Tap a point on a graph.** `SvgChart` takes taps: nearest dot within 30 px (or nearest point on the line when the chart has no dots) opens a readout with the full date and, per line, the values for that day. Each chart supplies its own text through `name`/`fmt`/`tip` on the series; the weight trend line has `noTip` so only real weigh-ins are tappable (the dashed projection never is). The selection is remembered by day, not array position, so a refresh from the Sheet can't point it at other data. A readout open = A/B auto-switch paused (`ChartPinContext`), reset when the tab, lift or A/B changes. Tooltip is clamped inside the chart.
- **Done from the old Shrexy list:** pending-note overlay (`overlayNotes`); the status dot counts Fitness's queue (`setAppPending` in `core/syncStatus.js`, also read from storage when Grimoire starts); first read from the Sheet waits for local load (`hydratedRef`).
- **No zoom:** see `core/noZoom.js` and `index.html`. Decision: applies to the tablet as well (a wall display has no use for it; easy to scope to phones only if ever wanted). **Page zoom stays blocked in 0.9.0.** The graph zoom below is a separate gesture on the graph only (it sets `touch-action: none` on the graph, and the page-level blockers are untouched).

## App 0.9.0: zoom the graphs, reorder a day's exercises
**Graph zoom (x axis only).** `SvgChart` (`chart.jsx`) keeps a `view` (window of days) in its own state; `zoom.js` holds the maths (`fitView`, `effectiveView`, `pinchView`, `panView`), all on day numbers.
- The full range is the first to last day with data. A view is always re-fitted into it on every draw, so it can never be wider than the data, never pass either end, and (if the data changes underneath) never end up outside it. Closest zoom: 7 days (`MIN_SPAN_DAYS`); a chart with less data than that doesn't zoom.
- **The value axes are built from all the data, never from the window**, so they don't move when you zoom (decision: Isaac asked for the y axis to stay put). Cost: when zoomed in on a quiet stretch, the line can look flat against a tall axis. Rejected: rescaling the value axis to the window.
- Pinch keeps the day under the middle of your fingers in place (moving both fingers sideways pans as well). One finger drags the window when zoomed. A drag when not zoomed does nothing, so the tablet's swipe to the next slide still works on an unzoomed graph; once zoomed (or during a pinch) the touch events are stopped from reaching the slide, so zooming and scrolling never switch slides. To leave a zoomed graph on the tablet, pinch out, or use the dots and arrows (rather than swiping on the graph).
- **Reset rule** (Isaac): the graph always starts on the full range and goes back to it when the slide switches. The zoom is state inside the chart, and the chart already sits under a `key` of tab, lift and A/B (Progress slide) or A/B (popup), so any change of graph, slide or closing the popup throws it away. Nothing is stored. Not done: pausing the tablet's A/B auto-switch while zoomed (a tapped-point readout does pause it). A zoomed graph is therefore reset by the next automatic switch. Open question for Isaac: should zooming pause the A/B switch too?
- While zoomed the plot is clipped to the plot area (otherwise lines and dots would draw over the axis labels). A tap that is really the end of a pinch or drag is ignored (`noClickUntil`, 400 ms). A pinch or drag closes an open readout; a readout whose point has scrolled out of view isn't shown.
- Test hooks: `data-testid="chart-plot"` with `data-view="<first>:<last>"` (the days on screen).

**Reorder exercises (phone entry screen).** `useReorder.js` (hook on the scrolling list) plus `reorderPlanChanges` in `plan.js`.
- Press and hold 500 ms (same as the name's graph press) on a card's background. Anything interactive inside a card (`input, textarea, select, button, svg, a`, the name (`data-nodrag`), the overload popover) never starts a drag; moving more than 10 px before the hold is up means it was a scroll. Works with touch and mouse.
- The drag is **vertical only** (`translateY`), done by writing styles straight onto the cards (no re-render per finger move; the screen is heavy to redraw), then one `flushSync` of the new order on drop, with the styles cleared in the same moment so nothing jumps. The list is scrolled by `requestAnimationFrame` within 80 px of its top or bottom edge. The `touchmove` listener is registered non-passive on the list from the start, because that is the only way a drag can stop the page scrolling (it is what iOS needs; Chrome verified). Cancelled touches put the card back.
- **Saving.** The new order is saved through the same path as "Edit workouts" (`onSavePlanOverride`, so a `fitness_plan` record and sync across devices). Decision: the order is the day's plan, so it is the new default for every date that falls on that week and weekday (past days show it too: it is only the order on screen). **Week 1 and Week 2 share their lifts, so the other week's same day gets the same order, only if it has exactly the same exercises** (it keeps its own sets and reps); otherwise only the current week changes. Rejected: saving per date (it would not become the default); asking each time.
- A day's first reorder turns the built-in exercises into a saved edit (same names, sets, reps, types). "Edit workouts" > **Reset to default** puts back the built-in order.
- Cards are `data-excard`; `.ex-card` turns text selection and the touch callout off for the cards (inputs and notes boxes explicitly keep selection).
- Not built (not asked for): reordering from the tablet's views, a drag handle, "undo". The Edit workouts screen has no drag (its rows are still edited by hand).

## App 0.11.1: tablet screen stays on, phone trash buttons
- **Wake lock (tablet display mode).** Moved into a shared hook, `src/core/wakeLock.js` (`useWakeLock(active)`, `wakeLockText`). Cause of the auto-lock: the browser releases a screen wake lock by itself when the page is hidden or the screen goes off; the old code kept the released lock in its ref, so the "re-acquire when visible" check thought it still had one and never asked again. The hook clears its ref on the lock's `release` event and asks again on `visibilitychange` (visible), on any `pointerdown`, and every 30 s (`WAKE_RETRY_MS`) while it doesn't hold one. It never asks while hidden (the browser refuses). Everything stops on close, as before.
- Super Shrexy settings shows **Keep screen on: On / Off (reason)** (`data-testid="fitness-wake-status"`), so a problem on the tablet can be checked without guessing.
- What it can't override: Android battery saver can refuse the lock (the line then says "refused (NotAllowedError)"), and the tablet's own lock screen still applies if Chrome is closed or another app is on top.
- **Trash button cut off on the phone.** A text box has a built-in minimum width (about 20 characters). With two boxes per row (weighted exercises) at phone width, the boxes didn't fit, and the trash icon (an SVG, which shrinks by default) was squeezed to 0 px. Reps-only rows (one box) had room, which is why Slow Pushups looked fine. Fix: the boxes get `min-width: 0` and the trash is a 32 px button with `flex-shrink: 0`. Measured in Chrome at 430 px (iPhone 15 Pro Max) and 375 px: before, 0 px wide on every weighted exercise; after, 32 px and inside the card on every row. The run row's three boxes got the same `min-width: 0`.

## Data format (app 0.8.0, backend 0.5.0)
Super Shrexy's data is stored as ordinary Grimoire records, in the tabs `fitness_daily`, `fitness_exercise`, `fitness_run`, `fitness_notes`, `fitness_plan` (fields in `src/apps/fitness/schema.js`, same column names as the old tabs). The app registers them in `meta.js`; the Grimoire sync engine sends only changed records and downloads only new ones; the newest `UpdatedAt` wins; deletes are flags. `src/apps/fitness/data.js` is the only file that touches records: the screens still use the old row shapes and `{ action, data }` items.
- **Ids** come from the natural key (`d-<date>`, `e-<date>-<hash of exercise name>-<set>`, `r-<date>`, `n-<date>`, `p-<week>-<day>`), so two devices editing the same day or set meet in one record. Chosen over random ids on purpose: random ids would let two devices create two records for one day. Ids are unique, as the charter requires.
- **Old data**: one-time import of `DailyLog`, `ExerciseLog`, `RunLog`, `CalendarNotes` through the old `fitness_getAll` action, stored with `UpdatedAt = 1` so it can never beat a real edit. The old tabs are never written by this app. A device flags the import done (`grimoire:fitness:recordsImported`) only after it succeeds.
- **Plan**: only *edits* are stored (`fitness_plan`, one record per week-day, rows as JSON). The built-in starting plan stays in code (`plan.js`) as the default, so a change to the default plan in a future release still applies to days nobody edited. "Reset to default" deletes the edit (deleted flag).
- **Saving**: `journalAdd` writes the items to `grimoire:fitness:queue` synchronously (a page can close before an IndexedDB write finishes), `applyItems` saves records, `journalDone` clears them. `recoverJournal` runs on every open and re-applies only items that are newer than what is saved (items carry `_t`; items from the old 0.6.0 queue have none and are applied unless identical).
- **Notes**: clearing a note leaves a deletion marker even if this device has no record of it yet, so an old note in the old tab can never come back over a deliberate clear.
- **Status**: the status line follows Grimoire's sync engine; the dot counts records waiting (the old queue count is only used for edits an older build left on the device, until the app is opened once).
- Backend: `Grim_App_fitness.gs` registers the app (`grimApp_fitness_`), the old actions stay for the one-time import and old Shrexy. Nothing in the backend interprets Fitness fields.
- Files: `theme.js` (palette names, CSS variables defined in `meta.js`), `plan.js`, `dates.js`, `logic.js`, `analytics.js`, `chart.jsx`, `ui.jsx`, `slides.jsx`, `modals.jsx`, `LogEntryView.jsx`, `WorkoutTracker.jsx` (the root: loading, sync status, saving).

## Backend (Phase 2b, history)
Fitness has **no script address or key of its own**. It reads Grimoire's one connection (home screen, gear, Connection). In 0.6.0 the backend served it with `fitness_getAll` and `fitness_logBatch` on the old tabs; from 0.8.0 those two actions are used only by the one-time import and by old Shrexy. The old Shrexy deployment and site are untouched and still work on the old tabs until Phase 3 retires them.

## Decisions and reasons
- Minimal changes only. Shrexy's known problems (key in the URL, whole-tab rewrites, full download every refresh, last-write-wins, unsynced notes vanishing) are deliberately **not** fixed here; they are on the Fix later list below.
- No automatic import from the old site's storage, even though both sites share one browser origin: an automatic copy of the old queue could resend stale edits over newer ones.
- One URL and one key for all of Grimoire (Isaac's rule, charter section 3). Fitness never asks for its own.
- The Fitness handler is the one place the script reads and matches app columns (Date, ExerciseName, SetNumber), because the old tabs have no IDs. Consequence: Fitness cannot go in the Vault until it moves to the shared record format.
- The Grimoire status dot does **not** count Fitness's own queue yet (it reads Grimoire's sync). Fitness's own sync icon turns gold when items wait.

## Rejected ideas
- Importing old unprefixed keys automatically (see above).
- Aborting an in-flight save when you leave the app: it is left to finish; the queue holds anything unconfirmed.

## Gotchas
- **Any new row of text boxes beside a button** needs `min-width: 0` on the boxes and `flex-shrink: 0` on the button, or the button disappears at phone width (0.11.1). jsdom can't catch this (no layout); measure in a real browser.
- **Before the first open of 0.8.0, sync old Shrexy to zero pending** (and any other device on 0.6.0): the import copies what is in the old tabs, so edits still waiting in the old app would miss it. After the move, old Shrexy no longer sees new data.
- **Deploy order for 0.8.0:** update the Apps Script (backend 0.5.0) first, then push the app. If the app arrives first, edits stay saved on the device (amber dot, "unknown_app" in Diagnostics) and go up once the backend is updated; nothing is lost.
- If Fitness shows "The key was rejected" or "Not connected yet", the problem is Grimoire's Connection setting on that device, not Fitness.
- Two apps, two sets of tabs: after the move, enter data only in Super Shrexy. Old Shrexy keeps reading and writing the old tabs and will not see new entries.
- The same-origin note above: old keys (`settings`, `queue`, ...) sit in the same browser storage as Grimoire's. Grimoire never touches them.

## Fix later
**Done:** pending-note overlay (0.7.0; replaced by records in 0.8.0); Fitness's pending count in the status dot; first-read race fixed (0.7.0); unique ids, newest-wins, incremental sync, Vault-able records (0.8.0); plan edits sync across devices and are stored in the Sheet (0.8.0); `WorkoutTracker.jsx` split into modules (0.8.0); palette in theme variables (0.8.0); remove unused `recharts`; cycle anchor stays hardcoded (`CYCLE_ANCHOR`).
**Still open:**
- The built-in starting plan is still in code (`plan.js`); only edits are in the Sheet (deliberate, see Data format).
- Phase 3: switch devices to Grimoire only, freeze old Shrexy, retire the old script deployment, and later delete the four old tabs.
- Old Shrexy's local sample data is gone from Super Shrexy (a sample-data mode that never writes records could be added if wanted).

## Open questions
- When to start Phase 3 (switch both devices, freeze old Shrexy, retire the old script deployment and key): after Phase 2b's checks pass on both devices and they run side by side without differences for about 2 weeks.
