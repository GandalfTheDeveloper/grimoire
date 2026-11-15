# Shell (Phase 1) spec

## Decisions
- Theme: Quiet slate for now. All colors are CSS variables set from `src/core/theme.js`; a custom look (background images, custom icons) later means editing that file and the `icon` field in each `src/apps/<id>/meta.js`, not the components. Isaac plans a much more custom theme after the foundation is done.
- Routing is hash-based (`#/`, `#/app/<id>`, `#/settings`, `#/diagnostics`) so iOS swipe-back and Android back work with no server config.
- Open on launch is applied once at startup and only when the URL has no route. Default: phone = Home, tablet = Fitness. Turning off the app that is set to open on launch resets it to Home.
- Apps on this device defaults to every app that declares support for the device type. All seven declare phone and tablet for now: **confirm per app at its planning**.
- Status dot reads `core/syncStatus.js` (stub). Tapping it opens Diagnostics.
- Service worker never touches cross-origin requests (the Apps Script backend). It does not skip waiting by itself; the user taps Update now.

## Gotchas
- jsdom fires `hashchange` asynchronously: tests must `await` after navigation.
- `dist/sw.js` is stamped with a build id in the Vite `closeBundle` step; if the stamp ever shows `__BUILD_ID__` in a deployed sw.js, updates will not be detected.
- Pages is served from a sub-path (`/grimoire/`), so everything uses relative URLs (`base: "./"`, manifest `start_url: "./"`).

## Not built yet (later rounds)
- Real sync, IndexedDB storage, Apps Script router and key (Round 2).
- Vault, files, full diagnostics rows (Round 3).
- iPhone and tablet testing, recovery drill, lost-device plan (Round 4).
- `docs/charter.md` copy of the charter (add so it matches the project copy exactly).

## Open questions
- Final Grimoire look and icon (custom images/design planned after the foundation).
