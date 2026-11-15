# Grimoire Charter

**Status: v1.3, updated 2026-11-15 (v1.0 approved 2026-11-09). Phase 0 (planning) and Phase 1 (shell + core) are complete.** Every chat in this project follows this document. If a request conflicts with it, say so before proceeding. Changes to this charter happen only with Isaac's OK.

---

## Read this first (applies to every reply, from the first message of every chat)

**A. Click-by-click, always.** Any time a reply asks Isaac to *do* something (click, type, run, open, download, copy, paste, configure), write it as numbered steps:
- One action per step.
- The exact name of every menu, button, tab and field, as it appears on screen.
- The exact text to type or paste, in a copyable block.
- Say which app or window (browser, VS Code, PowerShell, GitHub, Apps Script, Google Sheets, etc.) and assume nothing is already open.
- After each step, or small group of steps, a "You should see: ..." line, plus what to do if he doesn't.
- No step is skipped for being "obvious." This applies from the first reply of the chat. Isaac should never have to ask for it.

**B. Terminal steps are one copy-paste block.** Isaac's repo is `C:\Users\Brunn\Downloads\grimoire`.
- One code block per task, with all its commands combined, so Isaac only has to press Claude's copy button, paste into PowerShell (or the VS Code terminal), and press Enter.
- Every block starts with `cd "C:\Users\Brunn\Downloads\grimoire"` so it works wherever the terminal opened.
- Chain commands with `;` (not `&&`, which older Windows PowerShell doesn't support).
- **Isaac's computer has no Node.js or npm.** Never put `npm`, `node`, `npx` or any build or test command in a block he runs. Claude builds and tests in its own environment before every zip is sent (rule 3 in section 2), and GitHub Actions builds again on every push. The Actions tab is where Isaac confirms the result.
- The standard push block, after the zip has been extracted over the repo folder:
  `cd "C:\Users\Brunn\Downloads\grimoire"; git status; git add .; git commit -m "message"; git push`
  followed by: open the repo on github.com, click the **Actions** tab, and wait for a green check on the top run. If the run is red, Isaac sends Claude the error text from the failed step.
- Only runnable commands go inside the block: no `PS>` prompts, no explanations. Explanations, where to paste it, and "You should see: ..." go outside the block.
- **Do not combine** destructive commands (`reset --hard`, force push, deleting files) or any step where Isaac must check the output before continuing. Give those their own labeled block with a warning.
- If a task has several parts, give one block per part, each with a short heading.

**C. Check before sending.** Before every reply, ask: *Does this ask Isaac to do anything? If yes, is it click-by-click (A), and is every terminal part a single copy-paste block (B)?*

---

## 1. What Grimoire is

A personal "one stop shop" PWA (installable website) that opens to a home screen of Isaac's mini-apps and tools. Primary device: iPhone 15 Pro Max (Safari, home-screen app). Secondary: Samsung Android tablet (Chrome), a wall display for Fitness. Each app declares which devices it supports (phone, tablet or both).

- **Everything is an app.** There is no separate "tool" category. Even a simple app (e.g. the golden ratio calculator) may later get custom functionality that saves data, so every app is built on the same foundation and can use sync, files and the Vault whenever it needs them.
- **Super Shrexy Tracker** (existing fitness app) becomes the first app, called **Fitness** inside Grimoire.
- Isaac decides build order, themes and features, one app at a time. Do not assume an order.

## 2. Working rules (every chat, always)

1. **Click-by-click instructions** for every technical step, and **terminal steps as single copy-paste blocks**: see "Read this first" at the top. Windows, VS Code, PowerShell and git are his tools. Isaac is not a developer. Zips are built with files at the zip root (no wrapper folder) and go through the staging-folder routine.
2. **Claude never accesses Isaac's data.** Never ask for, fetch or read Sheet or Drive content. Specs are tab names and column headers only. Debug with error messages, row counts, build numbers and fake reproductions. **Warn Isaac before any step that would expose his data to Claude:** connecting a Drive/Sheets connector, uploading a Sheet download or any export from a vault app, pasting the script URL or key into chat, screenshots with personal content, or browser/computer control while Grimoire or the Sheet is open. (Fitness exports he uploads to his separate research chat are his call.)
3. **Verify by running, not by "build succeeded."** Before every ship: build, run the built bundle in a simulated browser (jsdom) with scenario tests, and for Apps Script, test against a simulated Sheets environment, including date/time corruption cases. Past deploys served stale code, so stale code is the first suspect when "nothing changed."
4. **Context discipline.** In an app chat, read only: that app's folder, `src/core/`, and that app's spec (`docs/apps/<app>.md`). Read other apps only through their small shared connection file, and only when building a cross-app feature. Code is read from the GitHub repo (user: GandalfTheDeveloper), not from copies in knowledge. Project knowledge stays small: this charter, the Handoff, and icons only.
5. **Chat hygiene.** One chat per app or per round of changes. Start a fresh chat when a chat gets long or a feature is finished. **At the end of every session, update that app's spec** (decisions, reasons, rejected ideas, gotchas, open questions), delivered in the same zip as the code. History lookups use conversation search, pulling snippets, not re-reading whole chats. **Reminder rule:** if Isaac comes back to a chat that already finished a feature or round of changes and asks for more tweaks, Claude reminds him to open a new chat for that round (and offers to update the spec first so nothing is lost).
6. **Direct, honest assessments.** Challenge assumptions, flag risks before building, and say plainly when something won't work.
7. **Planning before building.** No new repos, scripts or folders until Isaac says a phase has started.

## 3. Architecture

| Piece | Decision |
|---|---|
| Code | New GitHub repo `grimoire` (same account) on GitHub Pages: `gandalfthedeveloper.github.io/grimoire`. Built by GitHub Actions on push to `main`. Local copy: `C:\Users\Brunn\Downloads\grimoire`. |
| Old Shrexy | Repo and site stay untouched as a fallback. **Frozen** once Grimoire's build starts (emergencies only). Fixes happen in Grimoire's Fitness. Retire it after Fitness runs reliably on both devices for about 2 weeks. |
| Data | Same Google Sheet. New apps get new tabs. Existing Shrexy tabs and columns are never renamed or removed. Before the first Apps Script change: File → Make a copy of the Shrexy Sheet. |
| Backend | Same Apps Script project, **new deployment** with its own URL (old URL keeps running old code). One router, one handler file per app. |
| Key | New long random key for Grimoire, stored in Script Properties (not in code), sent in the request body (never the URL). |
| Icons | New Grimoire home-screen icon on both devices. Old Shrexy icon stays until retired. Before switching: sync to zero pending, then enter URL and key once. |
| Tech | React 18 + Vite + `lucide-react`. No unused dependencies. Code is split into small files. |

```
grimoire/
  src/shell/            home screen, top bar, navigation, settings
  src/core/             sync, storage, vault/crypto, files, theme tokens, shared UI
  src/apps/<app>/       one folder per app (Fitness, Cookbook, ...)
  apps-script/          router + one handler per app
  docs/charter.md       copy of this charter (kept matched)
  docs/apps/<app>.md    per-app spec in Handoff format
  CHANGELOG.md
```

- Apps load on demand, so opening Grimoire doesn't download every app.
- **Apps on this device** setting: each device lists which apps it uses. Only those sync down. Everything is always backed up in the Sheet.
- **Open on launch** is a per-device setting. Default: phone opens to the Grimoire home screen, tablet opens to Fitness display mode. The tablet can reach other apps from settings.
- Each app has its **own theme**. Shared components accept theme colors and never hard-code Shrexy's palette.
- Apps stop all timers, polling, wake locks and listeners when closed.

## 4. Engineering rules: do not carry Shrexy's problems forward

Fitness gets these rules once nested, but the move itself makes only minimal changes (see Phase 2). Shrexy's known issues go on the "fix later" list (section 8), not fixed during nesting.

| Shrexy problem | Grimoire rule |
|---|---|
| Save rewrites the whole tab | Write only changed rows |
| Every refresh downloads everything | Download only changes since last sync, only for apps on that device and only the open app when possible |
| No lock during writes | Script takes a short lock on every write |
| Last write wins blindly | Every record has an updated time; newest wins |
| Records matched by date | Every record has a unique ID |
| Unprefixed storage (`settings`, `queue`) | Everything on-device is prefixed `grimoire:<app>:` |
| Settings stuck on one device | Anything meant to match across devices syncs through the Sheet |
| Unsynced edits vanish from screen | Every screen shows saved-but-unsynced edits for every data type |
| Key in URL and code | Key in request body, stored in Script Properties |
| Timers run while hidden | Stop everything on close |
| One 2,200-line file | Small files per app; shared code lives in `core/` |
| No offline load, stale versions | Service worker, **visible build number**, "update available" prompt |
| Sheets converts dates and times | Every tab with dates/durations uses Shrexy's `normalize`, `TEXT_COLUMNS` and `REQUIRED_HEADERS` protections |

### Saving (never wait, never lose)
1. Every edit is stored on the device immediately (IndexedDB, with persistent storage requested). No Save button is needed to be safe.
2. Syncing runs in the background from the shell, so switching apps inside Grimoire never interrupts it.
3. When the app is hidden (switch or lock), pending changes are sent with a last-chance request (sendBeacon). iOS has no true background sync, so this usually works but isn't guaranteed.
4. If unconfirmed, it resends automatically on the next open. Writes are idempotent upserts, so resending is harmless.
5. **Status dot in the header:** green = everything is in the Sheet; amber = N items waiting on this device. The only possible loss is amber items if the device is lost or broken before the next open.
6. Deletes are recorded (deleted flag), never just erased.

### Record format (every app)
`Id, CreatedAt, UpdatedAt, SyncedAt, Deleted, SchemaVersion`, then app fields. Non-encrypted apps use readable columns. Encrypted apps store one encrypted `Payload` column per record. `SyncedAt` is stamped by the Sheet script when it receives a record and is used only to decide what a device still needs to download. The Apps Script reads the envelope columns Id, UpdatedAt, SyncedAt, Deleted and SchemaVersion.

**Built so encryption can be switched on for any app later.** To make that possible, every app must follow these rules from day one:
- The Apps Script only ever reads the envelope columns (`Id`, `UpdatedAt`, `SyncedAt`, `Deleted`, `SchemaVersion`). It never interprets, sorts, filters or calculates on app fields. All searching, sorting, filtering and charting happens on the device.
- All reads and writes go through the shared data layer in `core/`, which handles both readable and encrypted modes. Apps never talk to the Sheet directly.
- Apps don't depend on being able to read their own data in the Sheet by eye.

**Changing data later:** add fields, never rename or remove. Each record carries its schema version, and the app upgrades older records when read.

### Cross-app connections
Apps don't read each other's code or data directly. A small shared connection file in `core/` per feature (example: cookbook "add ingredients to grocery list" button) does it. Chats read only that file. Instant on the phone, cheap for Claude. A vault list on the tablet asks for the passphrase first.

### Calendars
Each app builds its own if needed. Any app with dated items also exposes them in one standard feed format (date, title, app, color, tap-target) so calendars can be merged later with no rework.

### Demo mode
Every app has fake-data demo mode that never touches the Sheet. Demo records are labeled and stored separately. Each app has a **Clear demo data** button that can only touch demo records.

### Diagnostics
A small link at the bottom of Settings (not prominent) showing: build number, items pending, last sync, recent errors, row counts, storage warnings. No personal content, copy-paste friendly.

### Limits and warnings
Google Sheets caps at 10 million cells per workbook. Banners warn at 80% of that, and when Google storage reaches 85%.

## 5. Security and the Vault

- GitHub (public) holds code only. Data sits behind the script URL plus key. Isaac turned on 2-Step Verification on his Google account (done).
- **The Vault** encrypts on the device before anything is sent, so the Sheet and Drive hold only scrambled text. **Starting members: Journal and Lists** (same passphrase for all). **Any app can be added later** with a per-app "Encrypt this app" switch in Settings (and removed again). Budget and Job Search to be decided at their planning.
- **Switching an app into the Vault** is a guided migration: (1) automatic Sheet backup first, (2) each record is encrypted and written to a new encrypted tab, (3) the result is verified by decrypting and comparing, (4) only then is the readable data retired. Existing files for that app get re-encrypted too. Apps with existing readable tabs (e.g. Fitness) follow the additive-only rule: a new encrypted tab is created, and the old tab is retired only after verification and Isaac's OK. Costs to know in advance: you can no longer read or edit that app's data directly in the Sheet, and the one-time migration takes a few minutes.
- Design: passphrase unlocks a randomly generated data key (the data key encrypts everything), so the passphrase can be changed without re-encrypting. Standard browser crypto (AES-GCM, strong key derivation). No home-made crypto.
- **Unlock rules:** phone stays unlocked until "Lock now" (phone lock screen is the protection). Tablet asks every time a vault app is opened and relocks on leaving.
- **Passphrase:** not recoverable. Isaac writes it down and keeps **two copies in two separate places.**
- **Import / Export** buttons (paste or upload, copy everything out) work while unlocked, so copy-paste and moving data from existing sources (e.g. the journal Google Doc) still work.
- **Recovery drill before real data:** lock, unlock on the other device, export, import. Must pass.
- **Build-then-secure:** every app is built and tested with fake data. Real sensitive data goes in only after Claude runs the security checklist and Isaac sees it pass.
- **Lost-device plan** (click-by-click, written: `docs/lost-device.md`): change the app key so the lost device can't sync, then re-key the vault so any remembered unlock stops working.
- No bank connections, ever (Budget is manual entry and document uploads). No sharing between people. No reminders or notifications.

## 6. Files and photos
Supported from the start. They live in a "Grimoire Files" folder in Isaac's Drive, one subfolder per app. Vault-app files are encrypted before upload. Photos are shrunk on the phone to about 300 KB before uploading, stored once (not duplicated by backups), and deleted items sit in a 30-day in-app trash.

## 7. Backups, releases and rollback
- **Weekly automatic copy of the Sheet** into Isaac's Drive, last 8 kept (Sheet data stays small). Written restore procedure.
- **Each release:** CHANGELOG entry, the standard test checklist, build number bumped. Written click-by-click **rollback** procedure, so a bad update is a five-minute undo.
- **Device settings vs synced settings:** each app's spec lists which is which. Device-only: apps on this device, open on launch, vault lock state. Synced: anything meant to match across devices (e.g. Fitness plan edits).

## 8. Phases

| Phase | What | Done when |
|---|---|---|
| 0 | Planning, charter | Isaac approves this charter |
| 1 | Shell + core (sync, storage, vault, files, diagnostics, home screen, service worker), fake data only. Grimoire's own look decided here. Includes new repo, Pages, Apps Script deployment and key, and the Sheet copy, all walked through click by click | Passes tests on iPhone and tablet, recovery drill passes |
| 2 | Fitness nested with minimal changes (prefix storage, start/stop timers on mount, full-height container, header becomes sub-header). Runs alongside old Shrexy | Both devices match old Shrexy's data |
| 3 | Switch devices to Grimoire, freeze then retire old Shrexy after about 2 weeks | Isaac says so |
| 4+ | New apps one at a time, in the order Isaac chooses | Per app |

**"Fix later" list for Fitness (not during nesting):** plan edits (`planOverrides`) sync across devices; pending-note overlay; incremental sync; plan data in the Sheet; split `WorkoutTracker.jsx`; remove unused `recharts`; remove stale nested `shrexy-tracker/` folder; confirm cycle-anchor stays hardcoded.

## 9. App index

| App | Vault | Notes |
|---|---|---|
| Fitness (Super Shrexy) | No (can be enabled later) | Existing. Spec: Handoff doc. Phone entry + tablet display. Own calendar. |
| Journal | **Yes** | Import from existing Google Doc, decided at build. |
| Lists | **Yes** | Custom per-list functionality plus user-created lists; wish list, grocery, around-the-house, project lists, to-do, quotes. Details decided at build; the most complex app. |
| Cookbook | No (TBD) | Uses macro data from the "Building a personal meal macro database" chat; pull the numbers into the cookbook's own data at build. Adds ingredients to grocery list. |
| Budget | TBD | Manual entry and uploads only. |
| Job Search tracker | TBD | |
| Golden ratio calculator | TBD | Starts simple; may gain custom functionality and saved data. |
| More ideas | | Isaac adds as they come. |

## 10. Adding a new app (checklist; follow the rules in section 4 so Vault can be enabled later)
1. ID and name. 2. Devices (phone, tablet, both). 3. Vault now, later, or never. 4. Dated items for a calendar feed? 5. Sheet tabs and columns (specs only, never data). 6. Cross-app connections needed. 7. Files/photos needed? 8. Own theme. 9. Create `docs/apps/<app>.md`. 10. Add to the index above.

## 11. Decision log
- 2026-11-15 (v1.3): Phase 1 complete. Round 4 shipped app 0.4.0 (re-key, Check the Vault, recovery drill, photo test) and the written procedures `docs/lost-device.md`, `docs/rollback.md`, `docs/restore.md` and the standard test checklist `docs/device-tests.md`. Isaac confirmed the photo test, recovery drill and practice re-key passed on iPhone and tablet. Phase 2 (nest Fitness) is next.
- 2026-11-15 (v1.2): Isaac's computer has no Node.js or npm, so no terminal block may contain `npm`, `node` or any build or test command. Builds and tests run in Claude's environment before each zip is sent, GitHub Actions builds on push, and Isaac confirms a green check on the Actions tab. The standard push block is `cd`; `git status`; `git add .`; `git commit`; `git push`. Replaces the earlier "stop on build failure" pattern, which could never run on his machine.
- 2026-11-15: Added a "Read this first" block at the top: click-by-click is defined concretely and applies from the first reply of every chat; terminal steps are always one combined copy-paste block (starts with `cd` to the repo, `;` chaining, destructive or check-first steps kept separate). Repo path recorded. Section 10 numbering fixed.
- 2026-11-15: Added SyncedAt to the record envelope so incremental download never misses late-arriving offline edits.
- 2026-11-09 (charter review): v1.0 approved. No app/tool distinction; every app can save data. Claude reminds Isaac to open a new chat when he returns for more tweaks. Encryption can be enabled per app at any time (guided migration, backup first).
- 2026-11-06: Name "Grimoire." Reuse Sheet and Apps Script. New repo, new deployment, new key.
- 2026-11-09: Click-by-click always. Claude never accesses data and warns before exposure. Separate calendars, mergeable later. Per-app themes. Journal and Lists in the Vault with one passphrase. Tablet defaults to Fitness with settings access to the rest. Fitness plan edits sync across devices (fix later). No bank links, sharing or notifications. Files/photos supported. Fitness research chat lives in the Fitness project; macro database and Calendar App chats stay here (Calendar App as archive only).
