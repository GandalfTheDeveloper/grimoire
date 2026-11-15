# The Vault (Rounds 3 and 4)

Encrypts an app's records and files on the device before anything reaches the Sheet or Drive. Spec for tabs and columns only; Claude never reads your data.

## How it works
- One passphrase (min 12 characters, NFKC-normalized). **It cannot be recovered.** Keep two written copies in two places.
- PBKDF2-SHA256 (600,000 iterations) turns the passphrase into a wrapping key. A random 256-bit data key is wrapped by it and stored in the Sheet tab `core_vault` (columns: Id, CreatedAt, UpdatedAt, SyncedAt, Deleted, SchemaVersion, Salt, Iter, Wrapped, KeyId, Version). Changing the passphrase re-wraps the key; nothing is re-encrypted.
- Records: AES-256-GCM, stored as `g1.<base64(iv+ciphertext)>` in a single `Payload` column of a twin tab named `<app>_<collection>enc`. Each ciphertext is bound to its place (`app|coll|id`), so a row cannot be swapped or copied elsewhere.
- Collection names must be 17 characters or fewer so the twin name fits.
- Per-app state lives in `core_vaultapps` (App, State): off, on, in (moving in), out (moving out). Journal and Lists default to on.
- Phone: the key stays on the device until **Lock now** (the phone's lock screen is the protection). Tablet: key kept in memory only; the app locks when you leave a Vault app.

## Moving an app in or out (Settings, The Vault, Encrypt)
Steps run in order and the app is frozen meanwhile: sync, Sheet backup, copy, move files, sync, read the encrypted tab back from the Sheet and compare, flip the state, clear the local copy. Any failure before the flip puts the app back as it was. **Grimoire never erases the old Sheet tab or Drive parts.** Remove them by hand once you are happy:
1. Open your Grimoire Sheet. 2. Right-click the old tab (for example `cookbook_recipes`) at the bottom. 3. Click Delete, then confirm. 4. For files, open Drive, folder "Grimoire Files", the app's subfolder, select the old parts, press Delete (they go to the bin).

Do one app at a time, with one device in use.

## Import / export
Settings, The Vault, Import / export. Format `grimoire-export` v1 (JSON). **Exports are not encrypted.** Import skips records that are not newer.

## Known limits
- Two devices creating a Vault at the same moment: setup syncs first and refuses if one exists.
- Changing the passphrase does not rotate the data key. Re-key does (see below).
- Photo shrinking uses the browser canvas; Diagnostics, Run photo test checks it on a real device (checklist in docs/device-tests.md).
- An edit made offline under the OLD key on another device, not uploaded before a re-key ran, can end up unreadable. The lost-device plan says to wait for green dots first. Check the Vault reports how many records cannot be opened (counts only).

## Lost passphrase
Unlock screen, Lost the passphrase? Start over, type RESET. Anything encrypted with the old key can never be opened again, so do this only while the Vault holds nothing you need.

## Re-key (Round 4): lost-device plan
Settings, The Vault, Lost a device? Re-key. Click-by-click plan: `docs/lost-device.md`.
- **Why:** a phone that stays unlocked keeps the data key on the device. Changing the passphrase does not change that key. Re-key makes a new random data key, re-encrypts every encrypted record, re-wraps every per-file key (Drive file bytes are untouched) and writes a new key record with a new KeyId. Other devices see the KeyId change, lock, and need the passphrase again.
- **Order of operations (`src/core/vaultRekey.js`):** checks (unlocked, passphrase right, Sheet reachable, this device downloads every app in the Vault, nothing frozen), sync and require nothing pending, Sheet backup, **re-encrypt everything in memory and test-decrypt each new ciphertext**, store all new ciphertext and the new key record in **one all-or-nothing local write** (`data.transaction`), upload, read every re-encrypted record back from the Sheet and decrypt it with the new key.
- **Failure before the local write:** nothing changed anywhere (tested by corrupting a record). **Failure after it:** this device is on the new key; the message says to Sync now until green and run Check the Vault. Re-sending is safe (idempotent).
- **Also re-encrypted:** deleted records (their old ciphertext would otherwise stay readable with the old key).
- **Does not:** erase what a lost device already holds, or change older Drive backups (still under the old key, protected by the passphrase).
- **Optional new passphrase** can be set in the same step (written down in two places, as always).
- **Check the Vault** (Diagnostics): tries every encrypted record and file key on this device, reports counts only.

## Recovery drill (Round 4)
Diagnostics, Drill step 1 (first device) then Drill step 2 (other device). Uses the vault self-test collection and invented values only. Step 2 reads from the **Sheet**, decrypts with this device's own unlock, compares a fingerprint, exports as grimoire-export v1, deletes the local copy, imports, compares again, then cleans up. Steps in `docs/device-tests.md`, section D2.
