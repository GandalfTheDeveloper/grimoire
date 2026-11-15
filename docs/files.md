# Files, photos, backup and usage (Round 3)

## Files
- Allowed for apps whose backend handler declares `files: true`. Cap 10 MB each. Photos are shrunk on the device first (longest side 1600 px, JPEG, aimed at 300 KB).
- Saved on the device first, uploaded in the background (counts toward the amber dot). Stored in Drive folder "Grimoire Files", one subfolder per app, as parts named `<fileId>.<n>` (1.5 MB each). Files over 1.5 MB are therefore not openable directly in Drive.
- Metadata: tab `core_files` (Id, CreatedAt, UpdatedAt, SyncedAt, Deleted, SchemaVersion, App, Name, Mime, Size, Parts, Hash, Photo, TrashedAt, FileKey). Vault apps use `core_filesenc` (Payload only); Drive parts are scrambled with a per-file key.
- Downloads are checked against the saved SHA-256. Trash keeps a file 30 days, then parts go to the Drive bin.

## Weekly backup
- A Sunday ~3 AM trigger copies the Sheet into Drive folder "Grimoire Backups" and keeps the newest 8. **Drive files are not copied.** Back up now (Diagnostics) does the same on demand and also runs before every Vault migration.
- Restore: open the backup copy in Drive, copy its tabs into the live Sheet (or point the backend at the copy), then in Grimoire run Diagnostics, Re-send everything.

## Usage warnings
Checked at most daily. Banner at 80% of the Sheet's 10,000,000 cells and at 85% of Google storage. Details in Diagnostics.

## Backend setup (once)
Add `Grim_Files.gs`, `Grim_Backup.gs`, `Grim_App_core.gs`; replace `Grim_Router.gs`, `Grim_Core.gs`, `Grim_App_selftest.gs`. Run `grimAuthorize` (grants Drive access), then `grimInstallWeeklyBackup`. Deploy a **new version** of the Grimoire deployment.
