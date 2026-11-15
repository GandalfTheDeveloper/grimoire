# Core: storage, sync and the Apps Script backend (Phase 1, Round 2) spec

Files: `src/core/{db,data,sync,syncConfig,syncStatus,selftest,index}.js`, `src/shell/{Connection,Diagnostics}.jsx`, `apps-script/Grim_{Router,Core,App_selftest}.gs`, tests in `tests/` and `scripts/verify-bundle.mjs`.

## Decisions and reasons

| Decision | Reason |
|---|---|
| Records live in IndexedDB; every edit is written there first and flagged `dirty` | Charter saving rule 1. No Save button is needed to be safe. Memory fallback if IndexedDB is blocked (Diagnostics shows which). |
| **`SyncedAt` added to the record envelope** (Id, CreatedAt, UpdatedAt, **SyncedAt**, Deleted, SchemaVersion). Stamped by the Sheet script, strictly increasing per tab | "Only what changed since last time" must be judged by one clock. Using each device's own `UpdatedAt` loses edits that were made offline and uploaded later. Tested: `a record with an OLD UpdatedAt that arrives late is still delivered`. **Charter amendment pending Isaac's OK, wording below.** |
| One request does push and pull for each collection | One round trip, fewer Apps Script runs. |
| Newest `UpdatedAt` wins; a record's UpdatedAt never goes backwards on a device | Charter rule. A device with a badly wrong clock can win or lose conflicts unfairly, but cannot cause lost deliveries. |
| Idempotent upserts; a pending record is cleared only if it was not edited while the request was in flight | Resending is harmless, and a late edit is never marked as saved by mistake. |
| Every Sheet column is written as plain text (numbers and time columns excepted: the numeric envelope columns) **before** values go in | The real fix for Sheets turning `8:45` into a time. Reads also repair converted values as a second layer. |
| Typed fields (`text`, `number`, `bool`, `json`) are stored as text and typed again on the device | Keeps the Sheet readable and immune to conversion. Apps never see the text form. |
| Sheet script never interprets app fields, only writes the columns it is handed | Charter: lets any app be encrypted later. Vault supplies a codec that returns `{ Payload }`. |
| Tab name is `<app>_<collection>` (lowercase letters and digits, no clash with Shrexy's capitalized tabs). Each app handler lists its allowed collections | A leaked key still cannot create arbitrary tabs or touch Shrexy's tabs. |
| Every request takes the script lock, **reads included** | A read that overlaps another device's write could advance its cursor past rows it has not seen. |
| Pull requests never create a tab; a cursor ahead of the Sheet (restored backup) is reset to 0 | Restore from backup must not strand devices. "Re-send everything" in Diagnostics re-uploads a device's records after a restore. |
| Sheet refuses (never truncates) a record over 45,000 characters in any cell and reports it | Truncation would be silent data loss. The record stays pending (amber dot) and an error is shown. |
| Key in the request body (`text/plain`, no CORS preflight), stored in Script Properties as `GRIMOIRE_KEY`, minimum 32 characters, compared in constant time | Charter section 3. Key is generated in Settings (48 random characters from the browser's secure random source). |
| All Apps Script names are prefixed `grim`/`GRIM_` | The old Shrexy code stays in the same project; unprefixed globals would silently override each other. |
| Sync runs in the shell, not in apps. Open app syncs every 60 s, every on-device app about every 10 min, and on open, on visible, on `online`, and 1.5 s after a save | Charter: only the open app when possible; apps hold no timers. |
| Last-chance send uses an in-memory copy of pending records, `sendBeacon`, pieces under 60,000 characters, nothing marked sent | Charter saving rule 3. Best effort on iOS, the amber dot is the real safety net. |
| Sync test writes three invented rows with known-mangled values to `selftest_items`, reads them back, reports field names only | Proves the protections on the real Sheet, not only in the simulator. On-demand: normal syncs never create that tab. |

## Wire format (client to backend)
POST (body is JSON sent as `text/plain`): `{ key, device, v:1, action:"sync", beacon?, items:[{ app, coll, fields:[columns], since, pull, records:[{ id, createdAt, updatedAt, deleted, schemaVersion, cols:{} }] }] }`.
Reply per item: `{ acked, rejected, stale, records, cursor, more, resetCursor, batchTime }` (or `{ error }`). Other actions: `ping` (version), `readback` (self-test only, handler must allow it). `GET` returns only `{ ok, app, version }`.

## Limits and gotchas
- **45,000 characters per record cell.** A Vault record's `Payload` is base64, so about 33,000 characters of plain text per record (roughly 5,000 words). The **Journal build must split long entries** (or store them as files). Decide at Journal planning.
- A formula-looking value (`=1+1`) is expected to stay text because the cell is plain text first. This is proven in the simulator and by the in-app sync test on the real Sheet; **if the real test reports `Formula`, tell Claude, because it means Sheets treats `setValues` strings differently than expected.**
- Seconds are dropped when repairing a converted 1899 time. Only matters for a column that was not text, which Grimoire never creates.
- Apps Script web apps are slow on a cold start (1 to 3 seconds). Nothing waits for them; sync is background.
- Apps Script allows one `doGet`/`doPost` per project. The old Shrexy ones are renamed `legacyDoGet`/`legacyDoPost` during setup, and the old deployment keeps serving its saved version. **Never use Edit, New version on the old Shrexy deployment.**
- `LockService` lock is per script project, shared by all deployments of it.
- A device clock that is far off wins or loses same-record conflicts unfairly. Delivery is unaffected.

## Not built (later)
- Vault codec and passphrase (Round 3). Files and photos (Round 3). Google cell-count and Drive storage warnings (Round 3).
- Recovery drill, lost-device plan (click-by-click), iPhone and tablet testing (Round 4).
- Fitness handler for Shrexy's existing tabs (Phase 2).

## Open questions
- Journal: how to store entries longer than the cell limit.
- Poll interval (60 s open app) is a guess; change after real use if the tablet display needs to feel more live.

## Proposed charter amendment (needs Isaac's OK, then update the project copy and `docs/charter.md` together)
- Section 4, "Record format (every app)": replace the first line with: `Id, CreatedAt, UpdatedAt, SyncedAt, Deleted, SchemaVersion`, then app fields. Add: "`SyncedAt` is stamped by the Sheet script when it receives a record and is used only to decide what a device still needs to download. The Apps Script reads the envelope columns Id, UpdatedAt, SyncedAt, Deleted and SchemaVersion."
- Section 11, Decision log: "2026-11-15: Added SyncedAt to the record envelope so incremental download never misses late-arriving offline edits."
