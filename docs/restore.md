# Restore the Sheet from a backup (click-by-click)

Grimoire copies the whole Sheet into Drive every Sunday around 3 AM and keeps the newest 8, in the folder **Grimoire Backups**. It also makes a copy before every Vault migration and every re-key, and when you tap **Back up now** (Diagnostics). **Files and photos are not copied** (they live once in **Grimoire Files**).

Restore when tabs were damaged or deleted in the Sheet. For a bad **update** use `docs/rollback.md` instead.

## What you will lose
Anything written after the backup was made is gone **from the Sheet**. Your devices still hold their own copies, and step 7 sends them back, so in practice you lose only what neither device has.

## Rules that protect your Vault
- **Restore these together or not at all:** `core_vault`, `core_vaultapps`, and every tab ending in `enc` (for example `cookbook_recipesenc`), all from the **same** backup. Mixing a key record from one day with encrypted tabs from another makes data unreadable.
- Never restore from a backup older than your last **re-key** unless you are certain you want the old key back.

## Restore one tab (the usual case)
1. **Close Grimoire on every device** (swipe it away), so nothing syncs while you work.
2. Open **drive.google.com**, open the folder **Grimoire Backups**, and double-click the newest good copy (name starts with "Grimoire backup" and a date). It opens in Google Sheets. Check the tab you need looks right.
3. Open your **live** Grimoire Sheet in another browser tab.
4. In the live Sheet, find the damaged tab at the bottom. Right-click it, click **Rename**, and put `old-` in front of the name (for example `old-demoapp_notes`). Press Enter.
5. Go back to the **backup** tab. Right-click the good tab at the bottom, click **Copy to**, then **Existing spreadsheet**. Pick your live Grimoire Sheet from the list (use the search box), click **Select**, then **Insert**.
6. Go to the live Sheet. You should see a new tab named **Copy of …**. Right-click it, click **Rename**, and type the **exact original name** (same capitals, no spaces; for example `demoapp_notes`). Press Enter.
7. Open Grimoire on your phone, tap the **gear**, **Diagnostics**, tap **Re-send everything**, then wait for the green dot. Do the same on your tablet.
8. Tap **Run sync test**. You should see "Sync test passed". Open the app you restored and check your data.
9. When you are sure all is well, right-click the `old-` tab in the Sheet and click **Delete**.

## Restore everything in the Vault
Do the steps above for **each** of these tabs, from the same backup: `core_vault`, `core_vaultapps`, `core_filesenc`, and every tab ending in `enc`. Then on each device: gear, **The Vault**, unlock with your passphrase, then **Diagnostics**, **Check the Vault**. You should see "Vault check passed".

## Last resort: use the backup as the live Sheet
Only if the live Sheet itself is gone. **This splits Grimoire from old Shrexy's data**, because old Shrexy keeps using the original Sheet.
1. Open the backup copy. Look at the web address: the long code between `/d/` and `/edit` is the Sheet's ID. Copy it.
2. In the original script's editor (Extensions, Apps Script), click the **gear** (Project Settings), scroll to **Script Properties**, click **Edit script properties**, add a row named `GRIMOIRE_SHEET_ID` with that code as its value, and click **Save script properties**.
3. On each device: **Diagnostics**, **Re-send everything**.
To go back to the original Sheet, delete that row.

## Files
Deleted files go to the Drive bin for 30 more days after Grimoire removes them: open **drive.google.com**, click **Bin**, find the file parts, right-click, click **Restore**. Photos and files are not in the weekly backup.
