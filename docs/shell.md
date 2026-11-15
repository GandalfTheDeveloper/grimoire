# Shell (Phase 1) spec

## Decisions
- Theme: Quiet slate for now. All colors are CSS variables set from `src/core/theme.js`; a custom look (background images, custom icons) later means editing that file and the `icon` field in each `src/apps/<id>/meta.js`, not the components. Isaac plans a much more custom theme after the foundation is done.
- Routing is hash-based (`#/`, `#/app/<id>`, `#/settings`, `#/diagnostics`) so iOS swipe-back and Android back work with no server config.
- Open on launch is applied once at startup and only when the URL has no route. Default: phone = Home, tablet = Fitness. Turning off the app that is set to open on launch resets it to Home.
- Apps on this device defaults to every app that declares support for the device type. All seven declare phone and tablet for now: **confirm per app at its planning**.
- Status dot reads `core/syncStatus.js`, which the sync engine writes (Round 2). Tapping it opens Diagnostics.
- Service worker never touches cross-origin requests (the Apps Script backend). It does not skip waiting by itself; the user taps Update now.

## Gotchas
- jsdom fires `hashchange` asynchronously: tests must `await` after navigation.
- `dist/sw.js` is stamped with a build id in the Vite `closeBundle` step; if the stamp ever shows `__BUILD_ID__` in a deployed sw.js, updates will not be detected.
- Pages is served from a sub-path (`/grimoire/`), so everything uses relative URLs (`base: "./"`, manifest `start_url: "./"`).

## Not built yet (later rounds)
- ~~Real sync, IndexedDB storage, Apps Script router and key~~ done in Round 2, see `docs/sync.md`.
- Vault, files, remaining diagnostics rows: Google cell-count and Drive-storage warnings (Round 3).
- Done in Round 4: iPhone and tablet checklist (`docs/device-tests.md`), recovery drill, lost-device plan.
- `docs/charter.md` copy of the charter (add so it matches the project copy exactly).

## Open questions
- Final Grimoire look and icon (custom images/design planned after the foundation).

## Round 3 additions
Vault gate in the app frame (setup or unlock before a Vault app opens; tablet relocks on leaving), Vault card in Settings, lock button in the top bar, real lock icon on tiles, usage banner, extra Diagnostics rows and tools.

## Phase 2 additions
Fitness is the first real app in the frame (`src/apps/fitness/`). It keeps its own theme variables in `meta.js`, fills the frame with `flex: 1`, and talks to the old Shrexy backend. See `docs/apps/fitness.md`. The Fitness placeholder tests became real opens of `fitness-root`.
