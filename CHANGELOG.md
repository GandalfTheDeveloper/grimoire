# Changelog

## 0.1.0 — Phase 1, Round 1 (shell)
- Shell: home screen (Quiet slate theme), top bar with sync status dot, Settings, Diagnostics, visible build number.
- Seven empty app slots (Fitness, Journal, Lists, Cookbook, Budget, Job Search, Golden Ratio), each lazy-loaded, each with its own theme object.
- Per-device settings: Apps on this device, Open on launch (phone: Home, tablet: Fitness). Stored under `grimoire:shell:*`.
- Service worker with "Update available" prompt (new version waits until you tap Update now).
- GitHub Actions deploy workflow (runs tests, then builds, then deploys to Pages).
- Placeholder Grimoire icon.
- Sync status is a stub (always green, 0 pending) until Round 2.
