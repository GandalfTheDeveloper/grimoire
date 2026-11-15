# Changelog

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
