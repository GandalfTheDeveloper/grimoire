# Fitness (Super Shrexy Tracker): app spec

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

## Backend (unchanged on purpose)
Fitness still talks to the **old Shrexy Apps Script URL and key**, entered once in Fitness's own gear (Settings) on each device. This is what keeps "both devices match old Shrexy's data" true, since both apps read and write the same Sheet through the same script. Grimoire's own sync (new URL, new key, `Grim_Router`) does not carry Fitness data yet. No Apps Script change this round.

## Decisions and reasons
- Minimal changes only. Shrexy's known problems (key in the URL, whole-tab rewrites, full download every refresh, last-write-wins, unsynced notes vanishing) are deliberately **not** fixed here; they are on the Fix later list below.
- URL and key are typed or pasted once per device (charter: "enter URL and key once"). No automatic import from the old site's storage, even though both sites share one browser origin: an automatic copy of the old queue could resend stale edits over newer ones.
- The Grimoire status dot does **not** count Fitness's own queue yet (it reads Grimoire's sync). Fitness's own sync icon turns gold when items wait.

## Rejected ideas
- Importing old unprefixed keys automatically (see above).
- Aborting an in-flight save when you leave the app: it is left to finish; the queue holds anything unconfirmed.

## Gotchas
- Old Shrexy and Fitness each keep their own queue. **Sync the old app to zero pending before the first time you use Fitness for real**, or edits waiting in the old app stay there.
- Same Sheet, two apps: until Phase 3 ends, use one app per day for entering data, to avoid last-write-wins surprises.
- The same-origin note above: old keys (`settings`, `queue`, ...) sit in the same browser storage as Grimoire's. Grimoire never touches them.

## Fix later (from the charter, unchanged)
Plan edits (`planOverrides`) sync across devices; pending-note overlay; incremental sync; plan data in the Sheet; split `WorkoutTracker.jsx`; remove unused `recharts` (not in Grimoire's `package.json`, so already gone here); remove stale nested `shrexy-tracker/` folder (old repo only); confirm cycle anchor stays hardcoded. Also now: show Fitness's pending count in Grimoire's status dot; move Fitness onto the shared data layer and Grimoire's backend (Phase 3 and later); move the palette into theme tokens.

## Open questions
- When to start Phase 3 (switch both devices, freeze old Shrexy): after both devices pass the Phase 2 checks and run side by side without differences.
