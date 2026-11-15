// Re-key: replace the Vault's data key with a brand-new one (lost-device plan, charter section 5).
//
// Why: a phone that stays unlocked keeps the data key on the device. If that phone is lost, changing the
// passphrase does nothing (the key is already unwrapped on it). Re-keying makes a new data key, so the
// lost phone's remembered unlock no longer opens anything that is written from now on, and every other
// device is locked until its owner types the passphrase again.
//
// What it does NOT do (and the written plan says so): it cannot take back what the lost device already
// holds locally, and older Sheet backups in Drive stay under the old key. Those are protected by the
// passphrase, the phone's own lock screen and wiping the lost phone.
//
// Safety, in order:
//  1. Needs the Vault unlocked, the current passphrase, a connection, and nothing waiting to upload.
//  2. This device must use every app that is in the Vault (it re-encrypts what it has on this device, so
//     an app this device never downloaded would be left under the old key and become unreadable).
//  3. A Sheet backup is made first.
//  4. Everything is re-encrypted in memory, and each new ciphertext is test-decrypted, BEFORE anything is
//     stored. One unreadable record stops the whole thing with nothing changed.
//  5. All new ciphertext plus the new key record are stored on the device in ONE all-or-nothing write.
//  6. It uploads, then reads every re-encrypted record back from the SHEET and decrypts it with the new key.
//  7. Files in Drive are not touched: each file's own key is re-wrapped inside its (re-encrypted) record.
import { rewrapFileKey } from "./vaultCrypto.js";

export class RekeyError extends Error {
  constructor(message, step) { super(message); this.step = step; }
}

export function createRekey({ data, db, vault, sync, files, collectionsFor, getAppsOnDevice, allApps, now = () => Date.now() }) {
  // every collection that is stored encrypted: app twins (<name>enc), file records, the vault self-test
  const encDefs = () => data.collections().filter((d) => d.codec === vault.codec);
  const tabOf = (d) => `${d.app}_${d.name}`;

  async function fetchRemote(def) {
    let since = 0;
    const out = [];
    for (let i = 0; i < 100; i++) {
      const r = await sync.call({ action: "sync", items: [{ app: def.app, coll: def.name, fields: def.codec.columns(def.fields), since, pull: true, records: [] }] });
      const item = (r.items || [])[0] || {};
      if (item.error) throw new RekeyError(`The Sheet refused the check (${item.error})`, "verify");
      out.push(...(item.records || []));
      if (!item.more) return out;
      since = item.cursor;
    }
    throw new RekeyError("Too many pages while checking", "verify");
  }

  // Apps that are in the Vault and have data, but that this device does not download.
  function appsMissingHere() {
    const here = new Set(getAppsOnDevice());
    return allApps.filter((a) => collectionsFor(a.id).length > 0 && vault.isEncrypted(a.id) && !here.has(a.id)).map((a) => a.name);
  }

  async function rekey({ passphrase, newPassphrase = "", onStep = () => {} }) {
    if (!vault.setupDone) throw new RekeyError("Set up the Vault first", "check");
    if (!vault.unlocked) throw new RekeyError("Unlock the Vault first", "check");
    try { await sync.call({ action: "ping" }); }
    catch (e) { throw new RekeyError(`Could not reach your Sheet (${e.message}). The new key has to reach it, so nothing was changed.`, "check"); }
    const missing = appsMissingHere();
    if (missing.length) throw new RekeyError(`This device does not download ${missing.join(", ")}, which is in the Vault. Turn it on under Apps on this device, wait for the green dot, then try again. Otherwise its data would be left on the old key.`, "check");
    const busy = allApps.filter((a) => vault.isFrozen(a.id));
    if (busy.length) throw new RekeyError(`${busy.map((a) => a.name).join(", ")} is being moved in or out of the Vault. Let that finish first.`, "check");

    const prep = await vault.prepareRekey(passphrase, newPassphrase); // throws VaultError on a wrong passphrase

    onStep("Syncing everything first");
    await sync.syncNow("all");
    if (data.pendingCount() > 0 || files.pendingCount() > 0) throw new RekeyError("Some items are still waiting on this device. Wait for the green dot, then try again.", "check");

    onStep("Backing up the Sheet");
    try { await sync.call({ action: "backup" }); }
    catch (e) { throw new RekeyError(`The backup failed, so nothing was changed (${e.message})`, "backup"); }

    onStep("Re-encrypting on this device");
    const expected = []; // what the Sheet must hold afterwards, for the read-back check
    const keyDef = data.getDef("core", "vault");
    let count = 0;
    await data.transaction(async () => {
      const rows = [];
      for (const def of encDefs()) {
        const stored = await db.byColl(`${def.app}|${def.name}`);
        for (const r of stored) {
          const ctx = { app: def.app, coll: def.logical || def.name, id: r.id };
          let values = {};
          if (!r.deleted) {
            try { values = await def.codec.decode(r.cols || {}, def.fields, ctx); }
            catch { throw new RekeyError(`A record in ${tabOf(def)} cannot be read with the current key, so nothing was changed. Run "Check the Vault" in Diagnostics for details.`, "read"); }
            if (def.app === "core" && def.name === "filesenc" && values.FileKey) {
              try { values = { ...values, FileKey: await rewrapFileKey(prep.oldKey, prep.key, values.FileKey, r.id) }; }
              catch { throw new RekeyError("A file's key cannot be opened with the current key, so nothing was changed. Run \"Check the Vault\" in Diagnostics for details.", "read"); }
            }
          }
          const cols = await prep.codec.encode(values, def.fields, ctx);
          // proof before anything is stored: the new key opens it and it says the same thing
          if (!r.deleted) {
            const back = await prep.codec.decode(cols, def.fields, ctx);
            if (JSON.stringify(back) !== JSON.stringify(values)) throw new RekeyError("A re-encrypted record did not read back the same, so nothing was changed.", "read");
          }
          const updatedAt = Math.max(now(), r.updatedAt + 1);
          rows.push({ ...r, cols, updatedAt, dirty: 1 });
          expected.push({ def, id: r.id, updatedAt, deleted: r.deleted ? 1 : 0, values: r.deleted ? null : values });
        }
      }
      const prevKey = await db.get("core|vault|vaultkey");
      if (!prevKey) throw new RekeyError("The key record is missing on this device, so nothing was changed.", "read");
      const keyCols = await keyDef.codec.encode(prep.record, keyDef.fields, { app: "core", coll: "vault", id: "vaultkey" });
      rows.push({ ...prevKey, cols: keyCols, updatedAt: Math.max(now(), prevKey.updatedAt + 1), deleted: 0, dirty: 1 });
      count = rows.length - 1;
      return rows;
    }, () => vault.commitRekey(prep.record, prep.key));
    await vault.refresh();

    onStep("Uploading the new copy");
    await sync.syncNow("all");
    if (data.pendingCount() > 0) {
      throw new RekeyError("This device is already on the new key, but the new copy has not finished uploading. Keep Grimoire open on a good connection, tap Sync now in Diagnostics until the dot is green, then run Check the Vault. Do not unlock another device until then.", "upload");
    }

    onStep("Checking the new copy in the Sheet");
    const remoteKey = (await fetchRemote(keyDef)).find((r) => r.id === "vaultkey" && !r.deleted);
    if (!remoteKey || String((remoteKey.cols || {}).KeyId) !== prep.record.KeyId) throw new RekeyError("The Sheet does not hold the new key record yet. Tap Sync now in Diagnostics until the dot is green, then run Check the Vault.", "verify");
    const byDef = new Map();
    for (const e of expected) { if (!byDef.has(e.def)) byDef.set(e.def, []); byDef.get(e.def).push(e); }
    for (const [def, list] of byDef) {
      const remote = new Map((await fetchRemote(def)).map((r) => [r.id, r]));
      for (const e of list) {
        const r = remote.get(e.id);
        if (!r) throw new RekeyError(`A record is missing from the Sheet (${tabOf(def)}). Tap Sync now in Diagnostics, then run Check the Vault.`, "verify");
        if (Number(r.updatedAt) !== e.updatedAt) throw new RekeyError(`A record in the Sheet is not the new copy yet (${tabOf(def)}). Tap Sync now in Diagnostics, then run Check the Vault.`, "verify");
        if (!e.deleted) {
          let v;
          try { v = await def.codec.decode(r.cols || {}, def.fields, { app: def.app, coll: def.logical || def.name, id: e.id }); }
          catch { throw new RekeyError(`A record read back from the Sheet could not be decrypted with the new key (${tabOf(def)}).`, "verify"); }
          if (JSON.stringify(v) !== JSON.stringify(e.values)) throw new RekeyError(`A record read back from the Sheet does not match (${tabOf(def)}).`, "verify");
        }
      }
    }
    onStep("Done");
    return { records: count, tabs: byDef.size, passphraseChanged: !!newPassphrase };
  }

  return { rekey, appsMissingHere };
}

// "Check the Vault": tries to decrypt everything this device holds and reports counts only. Never content.
export async function checkVault({ data, db, vault, files }) {
  if (!vault.setupDone) return { pass: false, text: "The Vault is not set up yet." };
  if (!vault.unlocked) return { pass: false, text: "Unlock the Vault first (Settings, The Vault)." };
  let ok = 0;
  const bad = {};
  for (const def of data.collections().filter((d) => d.codec === vault.codec)) {
    for (const r of await db.byColl(`${def.app}|${def.name}`)) {
      if (r.deleted) continue;
      const ctx = { app: def.app, coll: def.logical || def.name, id: r.id };
      try {
        const v = await def.codec.decode(r.cols || {}, def.fields, ctx);
        if (def.app === "core" && def.name === "filesenc" && v.FileKey) await files.checkKey(r.id, v.FileKey);
        ok += 1;
      } catch { const t = `${def.app}_${def.name}`; bad[t] = (bad[t] || 0) + 1; }
    }
  }
  const nBad = Object.values(bad).reduce((a, b) => a + b, 0);
  if (nBad === 0) return { pass: true, text: `Vault check passed: all ${ok} encrypted record${ok === 1 ? "" : "s"} on this device open with the current key.` };
  const where = Object.entries(bad).map(([t, n]) => `${t} ${n}`).join(", ");
  return { pass: false, text: `Vault check FAILED: ${nBad} record${nBad === 1 ? "" : "s"} cannot be opened (${where}); ${ok} are fine. If you just re-keyed on another device, tap Sync now and run this again.` };
}

