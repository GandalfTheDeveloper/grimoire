// Guided migration of an app into the Vault (or back out). Charter section 5:
//   (1) automatic Sheet backup first, (2) each record is encrypted and written to the new encrypted tab,
//   (3) the result is verified by decrypting what is in the SHEET and comparing, (4) only then does the
//   app switch over. The old readable tab is never erased by Grimoire: Isaac removes it by hand after
//   he is happy (steps in docs/vault.md). Existing files are re-encrypted too.
//
// The app is frozen while this runs (its state is "in" or "out"). If anything fails before the final
// switch, the app goes back to how it was, with its data untouched on the side it was using.
import { VaultError } from "./vaultCrypto.js";
import { tabName, ENC_SUFFIX } from "./data.js";

export class MigrationError extends Error {
  constructor(message, step) { super(message); this.step = step; }
}

export function createMigration({ data, vault, sync, files, collectionsFor }) {
  async function fetchRemote(def) {
    let since = 0;
    const out = [];
    for (let i = 0; i < 100; i++) {
      const r = await sync.call({ action: "sync", items: [{ app: def.app, coll: def.name, fields: def.codec.columns(def.fields), since, pull: true, records: [] }] });
      const item = (r.items || [])[0] || {};
      if (item.error) throw new MigrationError(`The Sheet refused the check (${item.error})`, "verify");
      out.push(...(item.records || []));
      if (!item.more) return out;
      since = item.cursor;
    }
    throw new MigrationError("Too many pages while checking", "verify");
  }

  async function verify(handle, dstSide, srcList) {
    const remote = await fetchRemote(dstSide.def);
    const byId = new Map(remote.map((r) => [r.id, r]));
    for (const s of srcList) {
      const r = byId.get(s.id);
      if (!r) throw new MigrationError(`A record is missing from the Sheet's new tab (${handle.name})`, "verify");
      if (Number(r.updatedAt) !== s.updatedAt || (r.deleted ? 1 : 0) !== s.deleted) throw new MigrationError(`A record in the Sheet's new tab is out of date (${handle.name})`, "verify");
      if (!s.deleted) {
        let values;
        try { values = await dstSide.def.codec.decode(r.cols || {}, dstSide.def.fields, { app: handle.app, coll: handle.name, id: s.id }); }
        catch { throw new MigrationError(`A record read back from the Sheet could not be decrypted (${handle.name})`, "verify"); }
        if (JSON.stringify(values) !== JSON.stringify(s.values)) throw new MigrationError(`A record read back from the Sheet does not match what is on the device (${handle.name})`, "verify");
      }
    }
    return srcList.length;
  }

  // direction: "in" (readable -> encrypted) or "out" (encrypted -> readable)
  async function migrateApp({ app, direction, onStep = () => {} }) {
    const into = direction === "in";
    const from = into ? "off" : "on";
    if (!vault.setupDone) throw new MigrationError("Set up the Vault first", "check");
    if (!vault.unlocked) throw new MigrationError("Unlock the Vault first", "check");
    if (vault.appState(app) !== from) throw new MigrationError(into ? "This app is already in the Vault" : "This app is not in the Vault", "check");

    onStep("Syncing everything first");
    await sync.syncNow("all");
    if (data.pendingCount() > 0) throw new MigrationError("Some items are still waiting on this device. Wait for the green dot, then try again.", "check");

    onStep("Backing up the Sheet");
    try { await sync.call({ action: "backup" }); }
    catch (e) { throw new MigrationError(`The backup failed, so nothing was changed (${e.message})`, "backup"); }

    await vault.setAppState(app, into ? "in" : "out");
    const handles = collectionsFor(app);
    const result = { records: 0, files: 0, oldTabs: [] };
    try {
      for (const h of handles) {
        const src = into ? h.sides.plain : h.sides.enc;
        const dst = into ? h.sides.enc : h.sides.plain;
        onStep(`${into ? "Encrypting" : "Decrypting"} ${h.name}`);
        const list = await src.exportAll();
        await dst.importAll(list);
        result.records += list.length;
        h._moved = { list, src, dst };
      }
      onStep("Moving files");
      result.files = await files.moveApp(app, into, (done, total) => onStep(`Moving files (${done} of ${total})`));

      onStep("Uploading the new copy");
      await sync.syncNow("all");
      if (data.pendingCount() > 0) throw new MigrationError("The new copy has not finished uploading. Check your connection and try again.", "upload");

      onStep("Checking the new copy in the Sheet");
      for (const h of handles) await verify(h, h._moved.dst, h._moved.list);
    } catch (e) {
      await vault.setAppState(app, from); // back to how it was; the data on the original side was never touched
      for (const h of handles) delete h._moved;
      throw e instanceof MigrationError || e instanceof VaultError ? e : new MigrationError(e && e.message ? e.message : "Unexpected problem", "copy");
    }

    await vault.setAppState(app, into ? "on" : "off");
    for (const h of handles) {
      await h._moved.src.purgeLocal(); // this device's old copy; the Sheet's old tab stays until Isaac removes it
      result.oldTabs.push(tabName(app, into ? h.name : h.name + ENC_SUFFIX));
      delete h._moved;
    }
    onStep("Done");
    await sync.syncNow("all");
    return result;
  }

  return { migrateApp };
}
