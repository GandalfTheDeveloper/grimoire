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


