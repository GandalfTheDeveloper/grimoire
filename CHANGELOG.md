# Changelog

**Two separate version numbers.** The *app* version is the Build number at the bottom of the home screen. The *backend* version is the Apps Script version shown in Diagnostics and after Save and test. They move independently.

| Release | App (Build) | Backend |
|---|---|---|
| Round 2 first delivery | 0.2.0 | 0.2.0 |
| Update banner fix | 0.2.1 | 0.2.0 |
| Text fix (`=` and `'`) | 0.2.2 | 0.2.1 |
| Full screen (tablet) | 0.2.3 | 0.2.1 |
| Round 3: Vault, files, backup | 0.3.0 | 0.3.0 |
| Unlock fix and diagnosis | 0.3.1 | 0.3.0 |
| Start over for a lost passphrase | 0.3.2 | 0.3.0 |
| Round 4: re-key, recovery drill, photo test, procedures | 0.4.0 | 0.3.0 |
| Phase 2: Fitness nested | 0.5.0 | 0.3.0 |
| Phase 2b: Fitness on Grimoire's one connection | 0.6.0 | 0.4.0 |
| Round of changes: bigger tablet tiles, Super Shrexy, tap a graph point, no zoom, and Super Shrexy on shared records (0.7.0 was built but never pushed; it is folded into this release) | 0.8.0 | 0.5.0 (Apps Script update needed) |
| Round of changes: zoom and scroll the graphs by date, drag to reorder a day's exercises | 0.9.0 | 0.5.0 (unchanged: no Apps Script update) |

## App 0.9.0 (backend unchanged at 0.5.0) — zoom the graphs, reorder a day's exercises
- **Zoom the graphs by date.** On every Super Shrexy graph (the Progress slide on the tablet and the long-press exercise graph on the phone), pinch two fingers apart to look at a shorter stretch of dates, and pinch together to go back out. **Only the dates change: the value axis (weight, reps, pace, percent) never moves.** While zoomed, drag with one finger to scroll left and right through the dates. You can't zoom out past the dates you have data for, can't scroll past the first or last day, and can't zoom in closer than 7 days. The graph always starts on the full range, and goes back to it whenever the graph changes (another tab, A/B, another lift, another slide, or closing the popup). While a graph is zoomed, a drag on it does not swipe the tablet to another slide. Tapping a point still shows its readout; a tap that is really the end of a pinch or drag is ignored, and a readout closes when you start to zoom. **Page zoom is still blocked** (charter v1.5): this is a gesture on the graph only, and the page itself never zooms.
- **Reorder a day's exercises.** On the phone's entry screen, press and hold the **background of an exercise card** (the card itself, not a box, button, icon or the exercise name, which still opens its graph). After half a second the card lifts and you feel a short buzz; drag it up or down, and the other cards slide out of the way. Let go to drop it. **It moves up and down only.** Near the top or bottom edge the list scrolls by itself so you can reach far away spots. The order is saved as that day's plan, so it becomes the new default (it syncs to your other devices like any "Edit workouts" change, and the Today, Week and Month views show the same order). **Week 1 and Week 2 share their lifts, so the same day in the other week gets the same order automatically** (only if both weeks have exactly the same exercises; otherwise only the week you are in changes). Sets, reps and logged numbers are untouched. A quick tap, a scroll, or letting go in the same place changes nothing.
- **Code**: new `zoom.js` (date-range maths), `useReorder.js` (the drag), `reorderPlanChanges` in `plan.js`; `SvgChart` gained the touch handling; `LogEntryView` marks its cards. No data format change, so **no Apps Script update is needed**: push the app only.
- Tests: 269 (was 241). New: range maths (can't go wider than the data, can't pass either end, 7-day limit, the day under your fingers stays put), pinch and drag on the chart (y axis labels identical before and after, no slide swipe, no accidental tap, reset on a new chart, Progress slide tab switch), where a dragged card lands, hold and drag with mouse and touch, drag stops the page scrolling and ignores sideways movement, scroll-vs-hold, boxes and buttons excluded, cancelled touch, the order saved for both weeks only when they match, and "close and reopen keeps the new order". Mutation-checked: excluded-element list, the save on drop, and the y axis following the zoom (that last one first slipped through a weak test; the test data was made to trend and it now fails as it should). Production bundle check 55/55. Also run in a real Chrome against the built app with real two-finger and long-press touch input (not iOS Safari: that is what the device checks below are for).

## App 0.8.0 / Backend 0.5.0 — Super Shrexy moves onto Grimoire's shared records
Includes everything in the 0.7.0 notes below (0.7.0 was never pushed).
- **Super Shrexy's data is now ordinary Grimoire records**: unique ids, `UpdatedAt` (the newest edit wins, no more "last write wins"), `SyncedAt`, deletes as flags, `SchemaVersion`. Five new Sheet tabs: `fitness_daily`, `fitness_exercise`, `fitness_run`, `fitness_notes`, `fitness_plan`, with the same column names as the old tabs plus the standard ones. Grimoire's sync engine does the work: it sends only what changed and downloads only what is new (the old app downloaded every row every few minutes). Because they are ordinary records, the app can be moved into the Vault later like any other app.
- **Stable ids from the natural key**: a day is `d-2026-11-15`, a set is `e-<date>-<exercise hash>-<set>`, and so on, so two devices editing the same day or set meet in ONE record and the newest edit wins. Nothing is ever duplicated. (This deliberately replaces random ids for this app: random ids would let two devices create two records for the same day.)
- **One-time move of your history.** The first time a device opens Super Shrexy while connected, it reads the old tabs (`DailyLog`, `ExerciseLog`, `RunLog`, `CalendarNotes`) once and imports them as old records (`UpdatedAt` = 1, so they can never overwrite an edit made after the move). **The old tabs are not touched**, and old Shrexy keeps working on them, but data you enter in Super Shrexy from now on no longer appears in old Shrexy.
- **Edit workouts now syncs across devices** (`fitness_plan`). Before, each device kept its own plan edits. Each device's existing local plan edits are carried over once (if two devices edited the same day, the later one wins). The built-in starting plan stays in the app; your edits are stored in the Sheet.
- **Saves are safer.** An edit is written to a small synchronous on-device journal first, then saved as a record; anything interrupted is recovered on the next open, and a recovered edit never overrides a newer saved one. Edits an earlier build left in its old queue are recovered the same way.
- **Removed**: the "Load sample data" button (it would now write fake history into your real Sheet) and the "auto-refresh every N minutes" box (Grimoire syncs about once a minute while the app is open, and right after each save).
- **Code**: `WorkoutTracker.jsx` (2,200 lines) split into `theme.js`, `plan.js`, `dates.js`, `logic.js`, `analytics.js`, `chart.jsx`, `ui.jsx`, `slides.jsx`, `modals.jsx`, `LogEntryView.jsx`, `schema.js`, `data.js` and a small `WorkoutTracker.jsx`. The palette now lives in the app's theme variables (`meta.js`), not in code.
- **Backend 0.5.0** (`Grim_Router.gs`, `Grim_App_fitness.gs`): registers the `fitness` app (tabs `daily`, `exercise`, `run`, `notes`, `plan`). The old `fitness_getAll` / `fitness_logBatch` actions stay (the one-time import and old Shrexy use them). **Update the Apps Script before pushing the app.**
- Tests: 240 (was 231), including the old-tab import, stable ids, newest-wins between two devices, nothing-new syncs send and receive nothing, Sheets-mangling values (`=`, `'`, `32:15`, `007`), plan sync, journal recovery. Mutation-checked: import timestamp, stable ids, recovery ordering, note deletion marker. Production bundle check 55/55 and a real-Chrome look at the built app.

## App 0.7.0 (never pushed on its own; included in 0.8.0) (backend unchanged at 0.4.0) — tablet tiles, Super Shrexy, tap a graph point, no zoom
- **Tablet home screen:** tiles are about twice as tall with icons about three times larger (72 px line icons, 84 px for Super Shrexy) and a bigger name. Phone tiles are unchanged.
- **Fitness is now "Super Shrexy"**, with the original teal "S" icon from the old Shrexy app on its home tile. Name only: the internal ID is still `fitness`, so your saved data, storage keys and the address `#/app/fitness` are untouched.
- **Tap a point on any graph** to see its data (date, value, and for lifts the sets and why it got its color; weigh-ins also show the trend). Tap it again, tap empty space or another point to change or close it. While a readout is open, the A/B auto-switch on the tablet waits so it is not swapped away. Works on body weight, consistency, lift (A and B, also in the long-press popup) and run graphs.
- **No pinch-zoom** (iPhone, and the tablet too): the page's viewport forbids it, touch is limited to panning, and Safari's own pinch events plus any two-finger move are cancelled. Scrolling is unchanged. See "Zoom" in `docs/device-tests.md` section G: iOS can ignore the viewport rule, so this one needs checking on the real phone.
- **Fixes carried over from the Shrexy list:** (1) a note saved on the device but not yet in the Sheet no longer vanishes when the screen refreshes from the Sheet (cleared notes stay cleared too); (2) Grimoire's status dot and Diagnostics now count the edits Fitness has waiting, including before Fitness is opened; (3) found while testing (1): the first read from the Sheet could run before the device's saved data had loaded and wipe it, so it now waits.
- Tests: 20 new (`tests/round5.test.jsx`), all seven new behaviors mutation-checked (each fails when its fix is removed). Real-Chrome check of the built bundle at tablet and phone sizes.
- Not done, on purpose (needs Apps Script and Sheet-format changes, or is a no-visible-change refactor): see `docs/apps/fitness.md`, "Fix later".

## App 0.6.0 / Backend 0.4.0 — Phase 2b
- **Fitness now uses Grimoire's one script address and key.** Its own address and key boxes are gone from Fitness's Settings, and any copy left on a device by 0.5.0 is deleted. Set the connection once in Grimoire (home screen, gear, Connection) and Fitness works on every device with that connection.
- **Backend 0.4.0** adds `Grim_App_fitness.gs` and two router actions, `fitness_getAll` and `fitness_logBatch`, on the existing Fitness tabs (`DailyLog`, `ExerciseLog`, `RunLog`, `CalendarNotes`). Tabs and columns are untouched; missing columns are added; Time and Pace stay plain text; converted dates and times are repaired; only changed rows are written; script lock on every request. **Update the Apps Script first, then push the app.**
- Fitness shows the real reason when a save fails (for example "The key was rejected") and keeps the edit queued.
- Last-chance send now goes to Grimoire's address with Grimoire's key.
- Old Shrexy and its script deployment are untouched and still work on the same tabs.
- Tests: 19 backend tests for the Fitness actions (run from the real `.gs` files in the simulated Sheet, including converted dates and times, existing General-format tabs, hand-added columns, deletes, bad items, repeats, lock) and the Fitness screen tests now run against that real script. Mutation-checked.
- Charter v1.4: Phase 2b added; rule "no app has its own script address or key"; Phase 3 also retires the old script deployment.
- Docs: `docs/apps/fitness.md`, `docs/device-tests.md` section F rewritten.

## App 0.5.0 (backend unchanged at 0.3.0) — Phase 2
- **Fitness (Super Shrexy Tracker) is now inside Grimoire.** Minimal changes only: on-device keys prefixed `grimoire:fitness:`, timers/wake lock/listeners stop when you leave, full-height inside Grimoire's frame, old title header became a sub-header (the full-screen button lives in Grimoire's top bar). Details: `docs/apps/fitness.md`.
- Fitness still uses the **old Shrexy Apps Script URL and key**, entered once in Fitness's own gear on each device, so it reads and writes the same Sheet as old Shrexy. No Apps Script change.
- Added: last-chance send of unsent edits when Fitness is hidden or closed (safe to repeat).
- Tests: 11 new Fitness tests against a simulated old Shrexy backend (data matches the Sheet, save reaches the Sheet with the old action names, storage prefixed and old keys untouched, nothing left running after close, wake lock released, offline edit survives leaving, no duplicate rows), mutation-checked; the production-bundle check now opens Fitness. Tablet and shell tests updated (Fitness opens for real instead of showing the placeholder).
- Docs: `docs/apps/fitness.md` (new), `docs/device-tests.md` section F (Phase 2 checks).

## App 0.4.0 (backend unchanged at 0.3.0) — Phase 1, Round 4
- **Re-key** (Settings, The Vault, Lost a device? Re-key): new random data key, every encrypted record re-encrypted, every file key re-wrapped (Drive bytes untouched), new key record. Backs up the Sheet first, test-decrypts everything in memory before storing anything, stores it in one all-or-nothing local write, then reads it all back from the Sheet. Optional new passphrase in the same step. Other devices lock and ask for the passphrase.
- **Check the Vault** (Diagnostics): tries every encrypted record and file key on the device, counts only.
- **Recovery drill** (Diagnostics, Drill step 1 and step 2): fake data only; proves the other device unlocks with the passphrase and reads what the first saved, then export, lose the local copy, import.
- **Photo test** (Diagnostics): pick a photo; checks the real shrink path (shape kept, within 1600 px, about 300 KB), plain and encrypted, then deletes the test files.
- Docs: `docs/lost-device.md`, `docs/rollback.md`, `docs/restore.md`, `docs/device-tests.md` (the standard test checklist, also Phase 1's finish line); `docs/vault.md` and `docs/files.md` updated.
- Tests: 8 re-key tests (two devices, corrupt record, wrong passphrase, missing app, restart), 8 drill and photo tests, 3 screen tests; bundle check now drives re-key through the real screens. Mutation-checked: removing the file-key re-wrap or the timestamp bump makes tests fail.
- Backend: no change (no Apps Script update needed this round).

## Docs only (no app change)
- Charter v1.3: Phase 1 marked complete, lost-device plan points to `docs/lost-device.md`, decision-log entry.
- `docs/charter.md` added to the repo, matching the project copy, now v1.2: no `npm`, `node` or build commands in Isaac's terminal blocks (his computer has no Node); builds and tests run before each zip and on GitHub Actions.

## App 0.3.2 (backend unchanged at 0.3.0)
- "Lost the passphrase? Start over" on the unlock screen. Needs RESET typed. It flags the key record deleted (never erases it); anything encrypted with the old key stays unreadable. Other devices fall back to the setup screen.

## App 0.3.1 (backend unchanged at 0.3.0)
- Passphrase boxes have a Show / Hide button (typos were invisible).
- Unlock also tries the passphrase without stray spaces at either end.
- A failed unlock now compares this device's key with the Sheet's copy and says which is the problem. If this device's copy is damaged and the Sheet's copy works, it repairs itself. Setup refuses a passphrase that starts or ends with a space.

## App 0.3.0 / Backend 0.3.0 — Phase 1, Round 3
- The Vault: passphrase, AES-256-GCM encryption on the device, lock/unlock, change passphrase, per-app encryption with a guided, verified migration (never erases the old tab), import/export.
- Files and photos in Drive (10 MB cap, 300 KB photo shrink, multi-part, per-file keys in the Vault, 30-day trash).
- Weekly Sheet backup (last 8 kept), Back up now, usage warnings (80% cells, 85% Drive), new Diagnostics rows and tools.
- Backend: file, backup and usage actions; run `grimAuthorize` and `grimInstallWeeklyBackup` once.
- Deferred to Round 4: re-key for the lost-device plan, real-device photo test, recovery drill.

## App 0.2.3
- Full screen: the manifest now asks Android to launch the installed app full screen (no clock, wifi or battery bar), falling back to the normal app window. A full screen toggle button (Shrexy's) appears in the top bar wherever the browser allows it, and hides on iPhone and when already launched full screen. Browsers only allow switching to full screen from a tap, so it cannot be turned on by itself at launch other than through the install setting.

## App 0.2.2 / Backend 0.2.1
- App 0.2.2: no app behavior change. It exists so the app number moves forward when the repo is updated with the backend fix below (the app was already 0.2.1 from the banner fix).
- Backend 0.2.1 (Apps Script only):
- Fix found by the in-app sync test on the real Sheet: text starting with `=` was evaluated as a formula and a leading apostrophe was dropped. Both are now stored exactly as sent. Backend version is 0.2.1 so you can confirm the new code is deployed.

## 0.2.1
- Fix: the "Update available" banner was drawn under the iPhone status bar (clock, signal, battery), making Update now untappable in portrait. It now clears the safe area.

## 0.2.0 — Phase 1, Round 2 (storage, sync, Apps Script backend)
- On-device storage in IndexedDB (memory fallback if the browser blocks it). Every edit is saved on the device first and marked pending.
- Shared data layer (`src/core/data.js`): collections with unique ids, UpdatedAt on every record, soft deletes, schema version, typed fields stored as text, a codec seam for the Vault (Round 3).
- Sync engine (`src/core/sync.js`), runs in the shell: sends only changed records, receives only what changed since its cursor, newest edit wins, background retry with backoff, last-chance send (sendBeacon) when the app is hidden, open app syncs every minute and every app on the device about every 10 minutes.
- Apps Script backend (`apps-script/`, three files, everything prefixed `grim`): key in Script Properties and in the request body, lock on every request, writes only changed rows, every column stored as plain text, repairs of converted dates and times when reading, one handler file per app, public version check.
- **Record format gains `SyncedAt`** (stamped by the Sheet). Charter amendment proposed, awaiting Isaac's OK. See `docs/sync.md`.
- Settings: Connection card (script address, key, Generate key, Save and test).
- Header dot is now real: green when nothing is waiting, amber with a count otherwise.
- Diagnostics: connection, backend version, pending, last sync, errors, row counts, storage mode. Tools: Sync now, Run sync test, Clear test data, Re-send everything.
- Sync test: three invented rows with the values Sheets likes to mangle (times, dates, leading zeros, a formula) written to a tab named `selftest_items` and read back.
- Tests: 92 (simulated Sheets with real conversion behavior, two-device scenarios, corruption cases, offline, in-flight edits, restore). `npm run verify` builds the production bundle and drives it in jsdom against the simulated Sheet (19 checks).

## 0.1.0 — Phase 1, Round 1 (shell)
- Shell: home screen (Quiet slate theme), top bar with sync status dot, Settings, Diagnostics, visible build number.
- Seven empty app slots (Fitness, Journal, Lists, Cookbook, Budget, Job Search, Golden Ratio), each lazy-loaded, each with its own theme object.
- Per-device settings: Apps on this device, Open on launch (phone: Home, tablet: Fitness). Stored under `grimoire:shell:*`.
- Service worker with "Update available" prompt (new version waits until you tap Update now).
- GitHub Actions deploy workflow (runs tests, then builds, then deploys to Pages).
- Placeholder Grimoire icon.
- Sync status is a stub (always green, 0 pending) until Round 2.


