# Standard test checklist (iPhone and tablet)

Run this after every release, on your phone and then your tablet. It is also Phase 1's finish line: **Phase 1 is done when every line passes on both devices and the recovery drill passes.** All of it uses invented data. Nothing here shows Claude your personal data: you only send me the result lines (they hold counts and sizes, never content).

Write the result of each step in your notes. If a step fails, stop and send me the step number and the exact words on screen.

## A. Every release (about 5 minutes per device)
1. Open Grimoire. If an **Update available** banner shows, tap **Update now**.
2. At the bottom of the home screen, check the **Build** line matches the release. You should see the new number.
3. Look at the dot at the top right. You should see it green. (Amber with a number means items are waiting; wait a minute.)
4. Tap the **gear**, then **Diagnostics**.
5. Tap **Sync now**. You should see "Synced."
6. Tap **Run sync test**. You should see "Sync test passed". Tap **Clear test data**.
7. If the Vault is set up and unlocked: tap **Run vault test**, you should see "Vault test passed". Tap **Clear vault test data**.
8. Tap **Check the Vault**. You should see "Vault check passed".
9. Tap **Run file test**. You should see "File test passed" (up to a minute).
10. Tap **Back up now**, then **Check usage**. You should see "Backup made" and "Usage is fine".
11. Go back to the home screen and open each app tile once. Each should open and the back button should return home.

## B. Phone only
12. **Offline load.** Turn on **Airplane mode**. Swipe Grimoire away to close it fully, then open it again. You should see the home screen load (the app is saved on the device). Turn Airplane mode off and wait for the dot to go green.
13. **Full lock behaviour.** Gear, **The Vault**, tap **Lock now**. Open Journal: you should see the unlock screen. Unlock with the passphrase.

## C. Tablet only
14. Open Grimoire. If **Open on launch** is Fitness, you should see Fitness (the wall display). Tap back: you should reach the home screen.
15. Open **The Vault** in Settings. It should say **Locked** after the app was closed. Unlock with the passphrase. Open Journal, tap back, open Journal again: it should ask for the passphrase again (the tablet re-locks when you leave).
16. If the full screen button shows in the top bar, tap it and confirm the status bar disappears.

## D. Round 4 one-time checks

### D1. Photo test (do it on BOTH devices; it checks the real photo path)
1. Gear, **Diagnostics**.
2. Under **Photo test**, tap **Choose file** (the label may say **Choose File**, **Browse** or **Photo Library**).
3. Pick a recent **portrait** photo (one you took holding the phone upright). It stays on your device. Only sizes are reported.
4. Wait up to a minute. You should see "Photo test passed. Original … plain … KB … encrypted … KB. Test files deleted."
5. If it says **turned sideways**, **over the 300 KB aim**, or **could not open that photo**, send me the full line and the photo's type shown in it.
6. Repeat with a **landscape** photo and, if you have one, a photo taken with the **front** camera.

### D2. Recovery drill (phone and tablet, one time)
This proves your second device can unlock and read what the first saved, using only your written passphrase, and that export and import bring data back after a device loses its copy.
1. **On the phone:** Gear, **The Vault**, make sure it is **Unlocked**. Gear, **Diagnostics**.
2. Tap **Drill step 1 (first device)**. You should see "Drill step 1 done: 5 fake records are encrypted in your Sheet".
3. Go back, gear, **The Vault**, tap **Lock now**.
4. **On the tablet:** open Grimoire, wait for a green dot, gear, **The Vault**. It should say **Locked**. **Get your paper copy of the passphrase** and type it in (not from memory), tap **Unlock**.
5. Gear, **Diagnostics**, tap **Drill step 2 (other device)**. You should see "Recovery drill passed: …".
6. If it fails, send me the exact line.
7. **On the phone:** unlock again, Diagnostics, tap **Clear vault test data**.

### D3. Practice re-key (once, while there is nothing real in the Vault)
Do this now, on fake data, so the first time is not during an emergency.
1. On the phone: wait for a green dot. Gear, **The Vault**, tap **Lost a device? Re-key**.
2. Type your passphrase, tick the box, tap **Re-key the Vault**, and wait for the green **Done** message.
3. On the tablet: wait for the green dot. Gear, **The Vault** should say **Locked**. Unlock with the passphrase.
4. On both: Diagnostics, **Check the Vault** ("Vault check passed"), **Run vault test** ("Vault test passed"), **Run file test** ("File test passed"). Tap **Clear vault test data**.
You should not need the lost-device plan's other steps for this practice (key change, erase).

### D4. Written procedures exist
Skim `docs/lost-device.md`, `docs/rollback.md`, `docs/restore.md` once. Tell me any step that does not match what you see on screen.

## E. Before putting real data in a Vault app
Charter: build-then-secure. Real sensitive data goes in only after Claude runs the security checklist and you see it pass. The checklist is: the vault test and drill pass on both devices; Check the Vault passes; the passphrase is written down in two places; the lost-device plan has been read; a backup less than a week old exists in **Grimoire Backups**.

## F. Phase 2: Fitness (one time, then the short version after each Fitness release)
Phase 2 is done when F1 to F4 pass on **both** devices and the Fitness data matches old Shrexy's. Nothing here needs Claude to see your data: you only compare screens yourself. **Do not paste your Apps Script URL or key into a chat.**

### F1. First-time setup (each device)
1. Open **old Shrexy** (its home-screen icon). Tap the **sync icon** at the top right. You should see "Up to date". The sync icon should not be gold. If it is gold, tap it again until it is not.
2. Open **Grimoire**. If an **Update available** banner shows, tap **Update now**. At the bottom of the home screen, the **Build** line should say 0.5.0.
3. Tap the **Fitness** tile. You should see "Fitness" at the top, and below it a thin row with the sync, phone or monitor, and gear icons.
4. Tap the **gear** in that thin row (not any other gear). A Settings panel opens.
5. Go to old Shrexy: tap its **gear**. Tap in the **Apps Script web app URL** box, **Select All**, **Copy**. Close the panel with the X without changing anything.
6. Back in Grimoire's Fitness Settings, tap in the same box, **Paste**.
7. Repeat steps 5 and 6 for the **key** box.
8. Tap **Save**. You should see the panel close and your history load within a few seconds. If you see "Couldn't reach the sheet" or "bad key", repeat 5 to 7 and check no extra spaces were pasted.

### F2. Data matches (each device)
1. In Fitness, look at today's screen and the **Month** view. Open old Shrexy next to it and compare the same month. The colored status bars, weights and notes should match.
2. On the tablet: the **Progress** slide's weight line should match old Shrexy's.

### F3. Entering data works (phone)
1. In Fitness, tap the **phone icon** if you are not on the entry screen. Type a test weight in **body weight**, tap **Save**. You should see **Saved ✓**.
2. Open **old Shrexy**, tap its sync icon. Today's weight should show what you typed. Fix or delete the test weight afterwards in either app.
3. In Fitness, type a different weight, then immediately tap the **back arrow** (top left). Reopen Fitness and tap its sync icon. You should see your weight kept, with no duplicate day in old Shrexy.

### F4. It stops when you leave (tablet)
1. Open Fitness. The screen should stay awake and the slides should rotate.
2. Tap the back arrow to Home and leave it for a few minutes. The screen should dim and lock as normal (Fitness no longer holds it awake).
