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

## F. Fitness / Super Shrexy (Phase 2 and 2b)
Phase 2b is done when F1 to F4 pass on **both** devices with only Grimoire's own address and key on them. Nothing here needs Claude to see your data: you compare screens yourself. **Do not paste your script address or key into a chat.**

### F1. Connection (each device, once)
1. Open **Grimoire**. If an **Update available** banner shows, tap **Update now**. At the bottom of the home screen, **Build** should say 0.8.0.
2. Tap the **gear** on the home screen, then find **Connection to your Sheet**. Your Grimoire script address and key should already be there (you entered them in Phase 1). Tap **Save and test**. You should see "Connected. Backend version 0.5.0."
3. If it says anything below 0.5.0, the Apps Script update has not been deployed yet: do the backend update first.
4. Tap the back arrow, then the **Fitness** tile. Fitness's own **gear** should have no address or key boxes, just a note pointing to Grimoire's Connection.

### F2. Data matches (each device)
1. In Super Shrexy, look at today's screen and the **Month** view. Open old Shrexy and compare the same month. The colored status bars, weights, run times (like 32:15) and notes should match what old Shrexy shows. (From 0.8.0 on, your history was copied once from the old tabs.)
2. On the tablet: the **Progress** slide's weight line should match old Shrexy's.

### F3. Entering data works (phone)
1. In Super Shrexy, on the entry screen type a test weight in **body weight** and tap **Save**. You should see **Saved ✓**.
2. Open your Sheet and look at the tab **fitness_daily**. A row for today should show what you typed, with an Id like `d-2026-11-15`. Old Shrexy's own tabs do **not** change. Fix or delete the test weight afterwards.
3. Type a different weight, then immediately tap the **back arrow**. Reopen Super Shrexy and tap its sync icon. Your weight should be kept, with only one row for today in **fitness_daily**.
4. Enter a run with time **8:45** and distance 1, Save, tap sync. Reopen it: the time should still read 8:45 (not 8:45 AM), and the **fitness_run** tab should say 8:45.

### F4. It stops when you leave (tablet)
1. Open Fitness. The screen should stay awake and the slides should rotate.
2. Tap the back arrow to Home and leave it for a few minutes. The screen should dim and lock as normal.

## G. App 0.7.0 round (included in 0.8.0) (do on the device named in each step)
### G1. Tablet home screen (tablet)
1. Open Grimoire. If an **Update available** banner shows, tap **Update now**. The **Build** line at the bottom of the home screen (tap the back arrow from Super Shrexy to reach it) should say 0.8.0.
2. The app tiles should be large: the icons about the size of a thumb-print, names in big type. Super Shrexy shows the teal **S** in a circle.

### G2. Super Shrexy name and icon (phone and tablet)
1. The tile says **Super Shrexy** (not Fitness) and the top bar inside the app says **Super Shrexy** too.
2. Open it: your data should be exactly as before (same weights, same notes). Nothing is lost by the rename.

### G3. Tap a graph point (tablet; also try the long-press graph on the phone)
1. Tablet, **Progress** slide, **Body weight**: tap one of the small white dots. A box appears with the date and **Weigh-in** weight, and the dot gets a ring. Tap the same dot again: the box goes away.
2. Tap **Lift progress**, then tap a dot. You should see the day's numbers and, on **B**, the reason for its color.
3. While a box is open the A/B should stop switching. Close the box: it carries on switching.
4. Phone: in Super Shrexy, press and hold an exercise name to open its graph. Tap a dot there.

### G4. Zoom (phone, the one that must be checked on the real iPhone)
1. Open Grimoire from the home-screen icon. Put two fingers on the screen and spread them apart: the page should **not** zoom. Pinch together: not zoom either. Double-tap on empty space: no zoom.
2. Scroll up and down with one finger: it should scroll normally.
3. Tap into a text box (for example body weight in Super Shrexy): the page should not jump bigger.
4. If any of these still zoom, tell Claude exactly which gesture and where. iOS Safari sometimes ignores the "no zoom" setting, which is why there are three layers of protection, and the test above is the only way to know they all hold on your phone.

### G5. Status dot (phone)
1. In Super Shrexy, turn on airplane mode, enter a weight and tap **Save**. Go back to Grimoire's home screen: the dot should be **amber** with a number.
2. Turn airplane mode off, open Super Shrexy, tap its sync icon. Go home: the dot should be **green**.

## H. App 0.8.0: Super Shrexy on shared records (do the first part on ONE device, then the rest)
Before you start: sync old Shrexy to zero pending on every device, and update the Apps Script (backend 0.5.0) first.
### H1. Your history moved (first device you open)
1. Open Super Shrexy while online. Wait about a minute, then open your Sheet. You should see five new tabs: **fitness_daily**, **fitness_exercise**, **fitness_run**, **fitness_notes** and (after your first plan edit) **fitness_plan**.
2. Compare a month in Super Shrexy with old Shrexy: weights, statuses, notes and run times should be the same. The old tabs (**DailyLog**, **ExerciseLog**, **RunLog**, **CalendarNotes**) should be unchanged.
3. In **fitness_daily**, imported rows have **UpdatedAt** 1. Rows you enter later have a large number.
### H2. Two devices, one record
1. On the phone, change today's weight and tap **Save**. On the tablet, wait about a minute (or tap sync). The tablet's Progress slide should show the new weight.
2. Change it again on the tablet, tap sync; the phone shows the tablet's number after its next sync. In **fitness_daily** there is still ONE row for today.
### H3. Plan edits sync
1. On the phone: gear, **Edit workouts**, change one exercise name on Week 1 Monday, **Save for this day**. Wait a minute.
2. On the tablet: gear, **Edit workouts**. The change should be there. **Reset to default** on either device puts the original back on both after a sync.
### H4. Colors (phone and tablet, especially the real iPhone)
1. Open the **Progress** slide's graphs: the lines and dots should be colored (turquoise, gold, red, white) exactly as before, and the buttons should be turquoise with dark text. If any graph looks black or colorless on the iPhone, tell me which one.
