# The Vault (Round 3)

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
- Re-key (new data key, for a lost device) is **deferred to Round 4**; changing the passphrase does not rotate the data key.
- Photo shrinking uses the browser canvas and must be tried on real devices in Round 4.

## Lost passphrase
Unlock screen, Lost the passphrase? Start over, type RESET. Anything encrypted with the old key can never be opened again, so do this only while the Vault holds nothing you need.
