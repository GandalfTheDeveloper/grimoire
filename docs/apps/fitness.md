# Fitness (Super Shrexy Tracker): app spec (Phase 2 and 2b)

Source of truth for how Fitness lives inside Grimoire. The full feature history, data model and gotchas of the original tracker are in the project's Handoff doc (`Grimoire-Handoff-Super-Shrexy-Tracker-Calendar.md`). This file covers what changed when it moved in (Phase 2, app 0.5.0).

## Checklist (charter section 10)
1. ID and name: `fitness`, "Fitness".
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

## Backend (Phase 2b, app 0.6.0 and backend 0.4.0)
Fitness has **no script address or key of its own**. It reads Grimoire's one connection (home screen, gear, Connection) through `sync.call` in `core/`, and the Grimoire script serves it with two actions in `apps-script/Grim_App_fitness.gs`:
- `fitness_getAll`: returns `dailyLog`, `exerciseLog`, `runLog`, `calendarNotes` as arrays of row objects (the shape old Shrexy returned).
- `fitness_logBatch`: `items = [{ action, data }]` with `logDaily`, `logExercise`, `logRun`, `logNote` (an empty Note deletes that day's note). Up to 500 items; one bad item fails alone.
The handler works on the **existing tabs** (`DailyLog`, `ExerciseLog`, `RunLog`, `CalendarNotes`): never renamed or removed, missing columns added, columns it doesn't know are left alone. It keeps the Shrexy protections (RunLog `Time` and `Pace` forced to plain text before writing, converted dates and 1899-anchored times repaired on the way out), writes only the rows that changed, and runs under the script lock. Both actions need the Grimoire key (Script Properties), sent in the request body.
Fitness no longer stores a script address or key: any left in `grimoire:fitness:settings` by app 0.5.0 are deleted the first time 0.6.0 opens.
The old Shrexy deployment and old Shrexy site are untouched and still work on the same tabs, until Phase 3 retires them.

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
- Old Shrexy and Fitness each keep their own queue. Sync the old app to zero pending before relying on Fitness, or edits waiting in the old app stay there.
- **Deploy order for 0.6.0:** update the Apps Script (backend 0.4.0) first, then push the app. An app 0.6.0 talking to backend 0.3.0 shows "The backend rejected the request" and keeps edits queued.
- If Fitness shows "The key was rejected" or "Not connected yet", the problem is Grimoire's Connection setting on that device, not Fitness.
- Same Sheet, two apps: until Phase 3 ends, use one app per day for entering data, to avoid last-write-wins surprises.
- The same-origin note above: old keys (`settings`, `queue`, ...) sit in the same browser storage as Grimoire's. Grimoire never touches them.

## Fix later (from the charter, unchanged)
Plan edits (`planOverrides`) sync across devices; pending-note overlay; incremental sync; plan data in the Sheet; split `WorkoutTracker.jsx`; remove unused `recharts` (not in Grimoire's `package.json`, so already gone here); remove stale nested `shrexy-tracker/` folder (old repo only); confirm cycle anchor stays hardcoded. Also now: show Fitness's pending count in Grimoire's status dot; move Fitness onto the shared record format (IDs, UpdatedAt, incremental sync, Vault-able); move the palette into theme tokens.

## Open questions
- When to start Phase 3 (switch both devices, freeze old Shrexy, retire the old script deployment and key): after Phase 2b's checks pass on both devices and they run side by side without differences for about 2 weeks.
