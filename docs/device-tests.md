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

## I. App 0.9.0: zoom the graphs and reorder exercises (no Apps Script update needed)
Do I1 and I2 on the tablet, I3 and I4 on the phone. The phone steps are the ones that must be checked on the real iPhone.
### I1. Zoom a graph (tablet)
1. Open Grimoire. If an **Update available** banner shows, tap **Update now**. The **Build** line at the bottom of the home screen should say 0.9.0.
2. Open **Super Shrexy**. Go to the **Progress** slide (tap its dot at the bottom, or the arrow on the right). Tap **Body weight**.
3. Put two fingers on the graph, a little apart, and spread them apart. You should see the dates along the bottom get closer together (fewer days, more detail). **The numbers down the left side should not change.**
4. Pinch the two fingers back together. You should see more dates again. Keep pinching: you should stop at the full range you started with, and not go wider.
5. Zoom in again. Put one finger on the graph and drag left and right. You should see the dates scroll. Drag until it stops: you should not be able to scroll past your first or last day.
6. While zoomed, drag across the graph. You should stay on the Progress slide (it should not swipe to another slide).
7. While zoomed, tap **Run pace**, then tap **Body weight** again. You should see the full range again.
8. Zoom in once more and wait for the slides to change on their own (or tap another slide's dot and come back). You should see the full range again.
9. The page itself should never zoom bigger. If it does, tell me exactly where and with how many fingers.
10. Tap **Lift progress**, wait for **B**, zoom and tap a dot. You should see its readout. Start to pinch: the readout should close.

### I2. Zoom a graph (phone)
1. Open **Super Shrexy**. On the entry screen, press and hold an exercise **name** (like Cable Rows) until its graph opens.
2. Do steps 3 to 5 of I1 on that graph. You should see the same behavior. Tap **A**, then **B**: each should start on the full range.
3. Tap the **X** to close it, open it again: it should start on the full range.
4. Tap a text box on the entry screen: the page should still not zoom or jump bigger (the old no-zoom rule still holds).

### I3. Reorder exercises (phone)
1. In Super Shrexy, on the entry screen of a day with several exercises, put one finger on the **background of an exercise card**: for example the **Target 3×12** text, or the empty space to the right of **Add set**. Do not touch a box, a button, an icon or the exercise name.
2. Keep holding for about half a second. You should feel a short buzz, and the card should lift slightly with a shadow.
3. Without lifting, slide your finger down. You should see the card follow your finger up and down only (not sideways), and the cards it passes slide out of the way.
4. Lift your finger when the card is where you want it. You should see it settle there, and the numbers you typed are still in the right cards.
5. Close Super Shrexy and open it again. You should see the new order.
6. Check **Week**: go to the Week view on the tablet (or open the **Today** slide). That day should list the exercises in the new order too.
7. Scroll up and down with one finger on a card. You should see a normal scroll that does not move any card. Tap a box and type: it should work as before.
8. With a long list (Sunday), hold a card and drag it to the very bottom of the screen and keep holding. You should see the list scroll by itself. Move the card to a spot far down and let go.
9. Press and hold the exercise **name**: its graph should still open (that did not change).
10. Wait a minute, then look at the same day on the tablet: it should have the new order.
11. Gear, **Edit workouts**, pick that week and day, tap **Reset to default** if you want the original order back.
12. If anything in 1 to 8 does not work (the page scrolls while you drag, the card does not lift, text gets selected, a menu pops up), tell me which step and on which device.

### I4. Nothing else changed (phone)
1. Tap **Save** on the entry screen. You should see **Saved ✓**.
2. Tap the **overload** icon on a card: its popover should open and close as before.

## J. App 0.10.0: Golden Ratio (after the Apps Script update)

### J1. Opens and calculates (phone)
1. On the Grimoire home screen, tap the **Golden Ratio** tile (gold spiral). You should see the a / b / a+b graphic and three fields, all set to **mm**, and no keyboard.
2. Tap **Longer section (a)**. You should see Golden Ratio's own number pad at the bottom (not the iPhone keyboard), and the graphic still with its a, b and a+b labels.
3. Type **10**. You should see b = **6.1803** and a+b = **16.1803** in gold, and 10 in white.
4. Tap **Done**. You should see one history card above the graphic.
5. Tap the **a+b** field (gold 16.1803) and type **5**. a should become **3.0902** and b **1.9098**. Tap **Done**: two cards.

### J2. Units (phone)
1. Set **a** to **in** and type **10** in a; set **b** to **mm**. b should be **156.9806**.
2. Do two more calculations. The units should stay as you set them.
3. Close Grimoire completely (swipe it away), open it again, open Golden Ratio within 30 minutes: units unchanged.
4. Leave it alone for more than 30 minutes, open it again: everything back to **mm**.

### J3. Tape measure (phone)
1. Tap a field set to **mm**, then tap the **ruler** key. It turns gold, the field switches to **in**, and a row of ⅛ … ⅞ keys appears.
2. Set **b** to **in**. Type **3** then tap **⅝**. a shows **3 5/8**, b shows **2 1/4** with **2.2404** in small grey text.
3. Set all three to **ft-in**, tap a, type **5**, **'**, **3**, **½**. b should be **3' 3 1/4"** and a+b **8' 6 3/4"**.
4. Tap the ruler key again: the fraction row goes away.

### J4. The three screens (phone)
1. With a few cards saved, tap a field: only the newest card shows at the top.
2. Drag up or down on that card. The pad closes, the fields go away and the history fills the screen with the graphic at the bottom.
3. Scroll through the history. Tap the **graphic**: back to the history, graphic and three fields.

### J5. History (phone, then computer)
1. Tap a card: its values and units load into the fields. No new card appears.
2. Hold a value on a card for half a second: you should feel a buzz and see "Copied …". Paste it into Notes to check.
3. In the history screen, swipe a card left and tap **Delete**: it disappears.
4. Open Grimoire on your computer (Settings > Connection once, with the same script address and key, and turn on Golden Ratio in **Apps on this device**). Open Golden Ratio: the same history (without the deleted card) should be there within a minute or two.
5. On the computer, click a field and type with the keyboard: digits, `.`, Backspace, Enter for Done.

### J6. Demo mode (phone)
1. In the history screen, scroll to the top and tap **Try demo mode**. You should see a gold "Demo mode" banner and 7 made-up cards.
2. Do one calculation. It joins the demo cards.
3. Tap **Clear demo data**. The banner goes away and your real history is back, without the demo calculation.

### J7. Copy key (phone)
1. Tap a field, type a value, tap the **Copy** key, then **b**. You should see "Copied … mm". Paste it somewhere to check.


## K. App 0.11.0: Golden Ratio round 2 (after the Apps Script update to 0.7.0)

### K1. Versions (phone)
1. Open **Grimoire**. If an **Update available** banner shows, tap **Update now**. At the bottom of the home screen, **Build** should start with **0.11.0**.
2. Tap the **gear** on the home screen, find **Connection to your Sheet**, tap **Save and test**. You should see "Connected. Backend version 0.7.0." If it shows 0.6.0, the Apps Script deployment was not updated: redo that part first.

### K2. Scroll back down (phone)
1. Open **Golden Ratio**. Do two or three calculations so there are cards.
2. Drag **down** on the history (as if pulling older cards into view). The fields go away and the history fills the screen.
3. Scroll back down until the newest card (bottom) is in view and stops. Lift your finger.
4. Drag **up** on the history once more, a short pull. You should see the three fields come back, with the same values as before.
5. On the default screen, drag **up** on the history. Nothing should change (it no longer opens the history screen).

### K3. Graphic clears, Clear key (phone)
1. Tap **a**, type **10**, tap **Done**. Tap the **graphic**. All three fields should be empty (grey labels), and the 10 calculation is a card in the history.
2. Tap a history card. Its values load. Tap the **graphic**: the fields empty again, and no extra card appears.
3. Tap **b**, type **50**. On the right side of the number pad, tap **Clear** (between the Copy key and backspace). All fields empty, the pad stays open, and **b** is still the active field. Type **5**: a and a+b fill in.
4. Tap **Done**, then the **graphic**. The b = 50 calculation should be in the history.

### K4. Settings (phone, then computer)
1. With Golden Ratio open, tap the **gear** in the top bar (top right). You should see **Golden Ratio settings** with two checkboxes.
2. Tap **Copy the unit too** so it is unchecked. Tap the **back arrow**: you are back in Golden Ratio (not the home screen).
3. Tap **a**, type **10**, tap the **Copy** key, then **b**. You should see "Copied 6.1803" (no "mm"). Paste into Notes to check.
4. Tap **Done**. Hold the gold **a+b** value on the card for half a second: "Copied 16.1803".
5. Tap the gear, uncheck **Show "Try demo mode"**, tap back. Scroll up to the top of the history: there should be no **Try demo mode** link.
6. On the computer, open Grimoire and Golden Ratio. Within a minute or two (or after **Diagnostics** > **Sync now**), the gear should show the same two settings unchecked.
7. Turn both settings back on if you want the old behaviour (or leave them; your choice).


## L. App 0.11.1: Super Shrexy fixes (no Apps Script update needed)

### L1. Phone: trash buttons
1. On the iPhone, open Grimoire and tap **Super Shrexy**.
2. Hold the phone upright (portrait). Scroll through today's exercises.
3. You should see a red **trash can** at the right end of every set row, on every exercise (including Cable Crossovers, Seated Dumbbell Press, Lateral Raises).
4. On an exercise you haven't logged, tap **Add set**, then tap the trash can on the new row. The row should disappear.

### L2. Tablet: screen stays on
1. On the tablet, open Grimoire. It opens to Super Shrexy's display mode.
2. Tap the **gear** on the Super Shrexy bar (right side, below Grimoire's top bar).
3. You should see **Keep screen on: On**. If it says **Off**, note the words in brackets and send them to Claude.
4. Tap the **X** to close settings.
5. Press the tablet's **power button** once to turn the screen off, then press it again and unlock.
6. Wait 1 minute, then open the gear again. It should still say **Keep screen on: On**. (Before this fix, this is the step where it broke.)
7. Leave the tablet alone for longer than its normal screen timeout. The screen should stay on.

If anything doesn't match, tell me the step number and what you saw instead.

## M. App 0.12.0: The Hoard, round B1 (after the Apps Script update to 0.8.0). Demo and fake data only

### M1. Versions (phone)
1. Open **Grimoire**. If an **Update available** banner shows, tap **Update now**. At the bottom of the home screen, **Build** should start with **0.12.0**.
2. Tap the **gear** on the home screen, find **Connection to your Sheet**, tap **Save and test**. You should see "Connected. Backend version 0.8.0." If it shows 0.7.0, the Apps Script deployment was not updated: redo that part first.

### M2. Opens in the Vault (phone)
1. On the home screen, the old **Budget** tile is now **The Hoard**, with a small **lock** on it.
2. Tap it. If the Vault is locked, you should see the unlock screen first. Unlock.
3. You should see seven sections across the top: **Overview, Plan, Transactions, Balances, Mortgage, Retirement, Goals**. On the phone, swipe the row sideways to reach the last ones. Transactions, Mortgage, Retirement and Goals say which round builds them.

### M3. Demo mode (do on the phone, the tablet AND the computer)
1. In The Hoard, tap the **gear** at the top right. You should see **The Hoard settings**.
2. Tick **Demo mode**. Tap the **back arrow**. A gold **Demo mode** strip shows under the sections.
3. **Overview:** In (blue), Spent (red), Saved (gold) for this month. Tap **Spending** to open its lines: **Air travel** says "Year to date: … planned of $1,200 a year".
4. Scroll down: **12 months of plan** bars. Tap a bar: the line above the chart shows that month's In, Spent and Saved in words.
5. Tap the **left arrow** next to the month five times. In (take-home) should drop: the demo has a raise four months ago.
6. **Plan:** income with taxes and benefits, the totals, and six sections. Amounts you type are white. Tap **Groceries**: under **Changes** you should see two lines (400, then 450 from the raise month).
7. **Balances:** Total cash, Investments, Net worth, eight demo accounts, and three charts.
8. Nothing should spill off the right edge on any screen, and the panels (line editor, income, Update balances) should fit. On the computer, try a narrow and a wide window.
9. Gear, tap **Clear demo data**. You should see "Demo data cleared. Real data was not touched." and the gold strip is gone.

### M4. Real records, fake values: the security checklist (phone, then tablet). Must pass before the seed file goes in
1. On the phone, open The Hoard (demo mode off). **Plan** tab. If it says **No plan yet**, tap **Add the six standard sections**.
2. Under **Staples**, tap **+ Add line**. Name: `Test line`. Amount: `1`. Tap **Save**.
3. Wait for the dot at the top right to turn green.
4. On the computer, open your Grimoire **Google Sheet**. You should see a tab **budget_dataenc**. Its columns are only **Id, CreatedAt, UpdatedAt, SyncedAt, Deleted, SchemaVersion, Payload**, and every Payload is scrambled text starting with `g1.`. You should NOT see "Test line", "Staples" or any amount anywhere, and there should be **no** tab called **budget_data**. (Looking at your own Sheet is fine; don't send me a screenshot of it.)
5. On the tablet, open Grimoire, open **The Hoard**, unlock with the passphrase from your **paper copy**. **Plan**: you should see the six sections and **Test line $1**.
6. Tap back to the home screen, then open The Hoard again. It should ask for the passphrase again (the tablet relocks when you leave; a computer browser behaves the same).
7. On the phone, tap **Test line**, scroll down, tap **Delete line (for mistakes)**, then tap it again. It disappears on both devices after the next sync.
8. Run section **E** of this checklist (vault test, drill, Check the Vault, passphrase in two places, recent backup).
9. Tell Claude "M4 passed" (or the step number and the words on screen if not). Only then import the seed file.

### M5. Seed import (phone, after M4 passes)
1. Save the seed file somewhere that is **not** inside `C:\Users\Brunn\Downloads\grimoire` (for example your Downloads folder itself), then get it onto the phone (AirDrop it to yourself or save it to iCloud Drive / Files).
2. In The Hoard, tap the **gear**. Under **Import seed file (one time)**, tap **Choose File**, then **Browse** and pick the file.
3. You should see "The file holds:" with counts of sections, plan line versions, income versions, accounts and sorting rules. Tap **Import**.
4. You should see "Imported N records". Tap back. **Plan** should now show your own plan. Compare it line by line with the spreadsheet.
5. Delete the seed file from the phone (Files app: press and hold it, **Delete**) and from the computer (and empty the Recycle Bin).
