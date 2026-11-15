# Rollback (click-by-click): undoing a bad update

A bad update is either the **app** (the website on GitHub Pages) or the **backend** (the Apps Script). Your **data** is never rolled back by either: for that see `docs/restore.md`.

## How to tell which one broke
- The app looks wrong, shows an error, or a screen does not open: the app.
- The app opens, but the dot stays amber, or **Save and test** shows an error, or the Diagnostics "Backend version" is not the one you expect: the backend.
- If unsure, undo the app first (it is the quicker one).

## A. Undo a bad app update (no terminal)
1. On a computer, open **github.com**, then your **grimoire** repository.
2. Click the **Actions** tab.
3. In the list, find the **last run that was good**: a green check, and a name (it is the commit message) from before the bad update. Click that run.
4. Click **Re-run all jobs** (top right), then in the box click **Re-run jobs**.
5. Wait about 2 minutes for a green check. You should see the run go from yellow to green.
6. On your phone, open Grimoire. Within a minute an **Update available** banner shows. Tap **Update now**.
7. At the bottom of the home screen, check the **Build** line. It shows the older version number.
8. Repeat on your tablet.

If **Re-run all jobs** is greyed out or the run is red, use B instead.

## B. Undo a bad app update (terminal, two blocks)
**Block 1: look at the last few updates.** In **PowerShell**, paste this and press Enter:
```
cd "C:\Users\Brunn\Downloads\grimoire"; git log --oneline -8
```
You should see up to 8 lines, each starting with a short code (like `a1b2c3d`) then the message. The bad update is usually the top line. Copy the short code of the bad one.

**Block 2: undo it.** Replace `PASTE-THE-CODE-HERE` with that short code, paste into PowerShell, press Enter:
```
cd "C:\Users\Brunn\Downloads\grimoire"; git revert --no-edit PASTE-THE-CODE-HERE; git push
```
You should see a line ending in `main -> main`. Then do steps 5 to 8 of A (open the **Actions** tab, wait for green, update the devices). This does not erase history: it adds a new update that reverses the bad one.

## C. Undo a bad backend update (Apps Script)
1. Open your Grimoire Sheet, click **Extensions**, then **Apps Script**.
2. Click **Deploy** (top right), then **Manage deployments**.
3. Click the **pencil** icon on the **Grimoire** deployment. **Never touch the old Shrexy deployment.**
4. Open the **Version** dropdown and pick the **previous version** (a lower number, look at the date and description).
5. Click **Deploy**, then **Done**. The script address does not change.
6. On a device, tap the **gear**, **Connection**, **Save and test**. You should see "Connected. Backend version …" showing the older version.

Know this: an older backend does not know about newer features. Round 3 actions (files, backup, usage) fail on a pre-Round-3 backend, and sync of everything else keeps working. Nothing is deleted. The CHANGELOG table says which backend version goes with which app version.

## After any rollback
1. On each device, wait for a green dot.
2. Gear, **Diagnostics**, tap **Sync now**, then **Run sync test**. You should see "Sync test passed".
3. If anything in Diagnostics looks wrong, send me the lines (they hold no personal content).
