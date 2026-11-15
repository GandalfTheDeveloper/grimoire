# Lost-device plan (click-by-click)

Use this if a phone or tablet is lost, stolen, or someone else may have used it. Do the steps **in this order**. The order matters: step 3 cuts the lost device off from your Sheet *before* step 4 swaps the Vault's key, so the lost device cannot push anything old back in.

## What this plan does, and what it cannot do
- **Does:** stops the lost device syncing (new app key), makes a lost phone's remembered Vault unlock useless for everything written from now on (re-key), and locks every other device until you type the passphrase again.
- **Cannot:** take back what the lost device already holds. Its on-device copy of your data and its old Vault key stay on it. What protects that is the phone's own lock screen and **erasing the device (step 1)**. Older Sheet backups in Drive are also still under the old key; they are only readable with your passphrase.
- Nothing here needs a terminal.

## Before you start
You need a device you still have, with Grimoire installed, **and a computer** (steps 3 uses the Apps Script editor, which is poor on a phone). Have your **Vault passphrase** (the paper copy) ready.

## 1. Lock or erase the lost device
**iPhone:**
1. On a computer, open **icloud.com/find** in your browser and sign in.
2. Click **All Devices**, then click the lost iPhone.
3. Click **Mark As Lost** (locks it and shows a message) or **Erase iPhone** (wipes it). Choose Erase if it will not come back.

**Samsung tablet or other Android:**
1. On a computer, open **android.com/find** (Google's Find Hub) and sign in. For a Samsung tablet you can also use **findmymobile.samsung.com**.
2. Click the lost device, then click **Secure device** or **Erase device**.

You should see a confirmation. Menu names change now and then; if you do not see these words, look for "lock" or "erase".

## 2. Sign the lost device out of Google
1. On a computer, open **myaccount.google.com** and sign in.
2. Click **Security** (left side).
3. Scroll to **Your devices** and click **Manage all devices**.
4. Click the lost device, then click **Sign out** and confirm.
5. If the lost device was signed in to Chrome or Gmail, also click **Security**, then **Password**, and change your Google password.

## 3. Change the Grimoire key (this cuts the lost device off)
1. On the computer, open **https://gandalfthedeveloper.github.io/grimoire/** in your browser.
2. Click the **gear** (top right), find **Connection to your Sheet**.
3. Click **Generate key**. You should see a long key appear and the message "New key made".
4. Click the **copy** icon next to the key. You should see "Key copied". Keep this tab open.
5. Open a new browser tab and go to **sheets.google.com**. Open your Grimoire Sheet.
6. Click **Extensions**, then **Apps Script**. A new tab opens with the script editor.
7. On the left, click the **gear icon** named **Project Settings**.
8. Scroll to **Script Properties** and click **Edit script properties**.
9. Find the row named **GRIMOIRE_KEY**. Click in its value box, select everything (Ctrl+A) and paste (Ctrl+V).
10. Click **Save script properties**. You should see the property saved.
11. Now give the new key to your device that you still have. Open **Gmail**, write a new email **to yourself** and paste the key into the body. Send it. On the device you still have, open the email, press and hold the key to select it, and copy it.
12. On that device, open Grimoire. Tap the **gear**, find **Connection to your Sheet**, tap in the **Key** box, select all, and paste. Tap **Save and test**. You should see "Connected. Backend version …". If you see "Not connected: auth", the key was pasted wrongly: repeat steps 9 to 12.
13. Delete the email (and empty Gmail's **Trash**) so the key is not left sitting in your inbox.
14. Repeat step 12 on every other device you still have.

You should now see the green dot on those devices after a sync. The lost device can no longer sync, whoever holds it.

## 4. Re-key the Vault (new data key)
Do this on a device you still have, **after** step 3. Wait until its status dot is green.
1. Open Grimoire, tap the **gear**, scroll to **The Vault**. If it says **Locked**, type your passphrase and tap **Unlock**.
2. Tap **Lost a device? Re-key**.
3. In **Current passphrase**, type your passphrase (tap **Show** to check it).
4. Leave **New passphrase** empty, unless the paper copy of your passphrase may have been seen. If you fill it in, write the new one down in **two places** before you continue.
5. Tick the box **My other devices will lock and ask for the passphrase again**.
6. Tap **Re-key the Vault** and **keep Grimoire open**. You should see steps go by (syncing, backing up the Sheet, re-encrypting, uploading, checking).
7. Wait for the green message **Done: … records re-encrypted with a new key and checked in the Sheet.** It takes a minute or two.
   - If you see a red message instead, nothing is half-done unless it says "already on the new key". Read it. The common ones: "still waiting" (wait for the green dot and try again) and "does not download <app>" (turn that app on under **Apps on this device**, wait for the green dot, try again).
   - If it says "already on the new key, but … has not finished uploading": keep Grimoire open on a good connection, go to **Diagnostics**, tap **Sync now** until the dot is green, then tap **Check the Vault**. Do not unlock another device until then.

## 5. Unlock your other devices
1. On each other device, open Grimoire and wait for the dot to go green (it syncs the new key).
2. Gear, **The Vault** should say **Locked**. Type the passphrase and tap **Unlock**.

## 6. Check it worked
On the device you re-keyed:
1. Tap the **gear**, then **Diagnostics**.
2. Tap **Check the Vault**. You should see "Vault check passed".
3. Tap **Run vault test**. You should see "Vault test passed".
4. Tap **Run file test**. You should see "File test passed".

## If you get the lost device back
Do not just reuse it. Erase or reset it, reinstall Grimoire from the web address, enter the **new** key, and unlock the Vault with the passphrase. Its old copy of your data is replaced by what syncs down.

## Setting up a replacement device
1. Open **https://gandalfthedeveloper.github.io/grimoire/** on it and add it to the home screen.
2. Gear, **Connection to your Sheet**: paste the script address and the **new** key (from your email-to-self method in step 3, or Generate a key again and repeat step 3).
3. Tap **Save and test**, wait for the green dot, then gear, **The Vault**, type the passphrase, **Unlock**.

## Known limits
- Edits made offline on another device under the **old** key, and not yet uploaded when the re-key ran, can end up unreadable. Wait for a green dot on every device you still have before step 4, and do not edit Vault apps offline during a re-key. **Check the Vault** (Diagnostics) lists how many records cannot be opened, never what is in them.
- Re-key re-encrypts what this device holds, so this device must download every app that is in the Vault. If one is missing, re-key refuses and tells you which.
- The passphrase is still the only thing that opens the Vault. A re-key does not replace it unless you typed a new one.
