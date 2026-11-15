// Files and photos (charter section 6). Bytes live in Isaac's Drive ("Grimoire Files", one subfolder per app);
// a small record in the Sheet (core_files, or core_filesenc for Vault apps) describes each file.
//
// Never wait, never lose: a file is stored on the device first and uploaded in the background in small
// parts. The status dot counts files that have not finished uploading. If the connection drops, the next
// sync carries on. Vault apps' files are encrypted on the device before upload (a random key per file,
// wrapped by the Vault's data key), so Drive only ever holds scrambled bytes.
// Deleted files sit in a 30-day trash in the app, then go to the Drive bin.
import { newId } from "./data.js";
import { b64, unb64, sha256Hex, sealBytes, openBytes, newFileKey, openFileKey } from "./vaultCrypto.js";
import { SyncError } from "./sync.js";

export const FILE_MAX_BYTES = 10 * 1024 * 1024;
export const PART_BYTES = 1500000;
export const TRASH_DAYS = 30;
const DAY = 86400000;
const PENDING = "file:";

export class FileError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const fields = { App: "text", Name: "text", Mime: "text", Size: "number", Parts: "number", Hash: "text", Photo: "bool", TrashedAt: "number", FileKey: "text" };

export function createFiles({ data, db, vault, sync, shrink, now = () => Date.now() }) {
  const plainCol = data.define({ app: "core", name: "files", fields });
  const encCol = data.define({ app: "core", name: "filesenc", logical: "files", fields, codec: vault.codec });
  let pendingN = 0;
  let chain = Promise.resolve();
  const serial = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

  async function countPending() {
    const n = (await db.metaKeys(PENDING)).length;
    if (n !== pendingN) { pendingN = n; sync.refreshPending(); }
    return pendingN;
  }
  sync.setExtraPending(() => pendingN);

  const toItem = (rec, enc) => ({
    id: rec.id, app: rec.App, name: rec.Name, mime: rec.Mime, size: rec.Size, parts: rec.Parts, hash: rec.Hash,
    photo: !!rec.Photo, trashedAt: rec.TrashedAt || 0, createdAt: rec.createdAt, enc, fileKey: rec.FileKey,
  });

  async function toBytes(input) {
    // duck-typed on purpose: a Uint8Array made in another window or worker fails "instanceof"
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (input && typeof input.arrayBuffer === "function") return new Uint8Array(await input.arrayBuffer());
    throw new FileError("bad_input", "Expected a file or bytes");
  }

  async function upload(app, fileId, stored, mime) {
    const parts = Math.max(1, Math.ceil(stored.length / PART_BYTES));
    for (let i = 0; i < parts; i++) {
      await sync.call({ action: "fileput", app, fileId, index: i, mime, data: b64(stored.subarray(i * PART_BYTES, (i + 1) * PART_BYTES)) });
    }
    return parts;
  }

  // Uploads everything still waiting on this device. Stops quietly when there is no connection.
  function flush() {
    return serial(async () => {
      for (const k of await db.metaKeys(PENDING)) {
        const p = await db.getMeta(k, null);
        if (!p) { await db.delMeta(k); continue; }
        try {
          await upload(p.app, k.slice(PENDING.length), p.bytes, p.mime);
        } catch (e) {
          if (e instanceof SyncError && (e.code === "network" || e.code === "not_configured" || e.code === "busy")) break;
          throw e;
        }
        await db.delMeta(k);
      }
      await countPending();
    });
  }
  sync.onAfterSync(async () => { await flush(); await purgeExpired(); });

  // Stores a file. Returns as soon as it is safe on this device; the upload continues in the background
  // (or finishes first when { wait: true }, which a migration uses).
  async function putInternal(app, input, { wait = false, trashedAt = 0, enc: forceEnc } = {}) {
    const enc = forceEnc === undefined ? vault.isEncrypted(app) : !!forceEnc;
    vault.guard(app, enc);
    let bytes = await toBytes(input.bytes !== undefined ? input.bytes : input.file);
    let mime = input.mime || (input.file && input.file.type) || "application/octet-stream";
    if (input.photo) {
      const shrunk = await shrink(input.bytes !== undefined ? new Blob([bytes], { type: mime }) : input.file);
      bytes = shrunk.bytes; mime = shrunk.mime;
    }
    if (bytes.length > FILE_MAX_BYTES) throw new FileError("too_big", "That file is over the 10 MB limit");
    const id = newId();
    let stored = bytes, fileKey = "";
    if (enc) {
      const fk = await newFileKey(vault.key(), id);
      stored = await sealBytes(fk.key, bytes, "file|" + id);
      fileKey = fk.wrapped;
    }
    const hash = await sha256Hex(stored);
    const parts = Math.max(1, Math.ceil(stored.length / PART_BYTES));
    const storedMime = enc ? "application/octet-stream" : mime;
    await db.setMeta(PENDING + id, { app, bytes: stored, mime: storedMime });
    pendingN += 1;
    const col = enc ? encCol : plainCol;
    const rec = await col.put(id, { App: app, Name: String(input.name || "file"), Mime: mime, Size: bytes.length, Parts: parts, Hash: hash, Photo: !!input.photo, TrashedAt: trashedAt, FileKey: fileKey });
    sync.refreshPending();
    if (wait) await flush(); else flush().catch(() => {});
    if (wait && (await db.getMeta(PENDING + id, null))) throw new FileError("upload", "The file could not be uploaded. It is saved on this device and will retry.");
    return toItem(rec, enc);
  }

  // internal: true is for the migration, which works on a frozen app and handles both sides itself
  async function allRecords(app, { internal = false } = {}) {
    if (!internal) vault.guard(app);
    const out = [];
    for (const r of await plainCol.list()) if (r.App === app) out.push(toItem(r, false));
    if (vault.unlocked) for (const r of await encCol.list()) if (r.App === app) out.push(toItem(r, true));
    return out.sort((a, b) => a.createdAt - b.createdAt);
  }

  async function find(app, id, opts) {
    const item = (await allRecords(app, opts)).find((i) => i.id === id);
    if (!item) throw new FileError("not_found", "That file is not here");
    return item;
  }

  async function get(app, id, opts) {
    const item = await find(app, id, opts);
    const local = await db.getMeta(PENDING + id, null);
    let stored;
    if (local) stored = local.bytes;
    else {
      const chunks = [];
      for (let i = 0; i < item.parts; i++) {
        let r;
        try { r = await sync.call({ action: "fileget", app, fileId: id, index: i }); }
        catch (e) {
          if (e instanceof SyncError && e.code === "not_found") throw new FileError("uploading", "This file has not finished uploading from the device that saved it. Try again after that device syncs.");
          throw e;
        }
        chunks.push(unb64(r.data));
      }
      stored = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let off = 0;
      for (const c of chunks) { stored.set(c, off); off += c.length; }
    }
    if ((await sha256Hex(stored)) !== item.hash) throw new FileError("corrupt", "The downloaded file does not match what was saved");
    const bytes = item.enc ? await openBytes(await openFileKey(vault.key(), item.fileKey, id), stored, "file|" + id) : stored;
    return { meta: item, bytes };
  }

  const colFor = (item) => (item.enc ? encCol : plainCol);
  async function setTrashed(app, id, t) {
    const item = await find(app, id);
    await colFor(item).put(id, { TrashedAt: t });
  }

  // Removes a file for good: bytes to the Drive bin, record flagged deleted. Drive keeps binned files 30 more days.
  async function destroy(item) {
    const local = await db.getMeta(PENDING + item.id, null);
    if (local) { await db.delMeta(PENDING + item.id); await countPending(); }
    else await sync.call({ action: "filedelete", app: item.app, fileId: item.id, parts: item.parts });
    await colFor(item).remove(item.id);
  }

  async function purgeExpired() {
    const cut = now() - TRASH_DAYS * DAY;
    let n = 0;
    const lists = [plainCol.list()];
    if (vault.unlocked) lists.push(encCol.list());
    for (const [i, list] of lists.entries()) {
      for (const r of await list) {
        if (r.TrashedAt && r.TrashedAt < cut) {
          try { await destroy(toItem(r, i === 1)); n += 1; } catch (e) { if (!(e instanceof SyncError)) throw e; }
        }
      }
    }
    return n;
  }

  // Moves every file of an app between readable and encrypted (the Vault migration). Safe to run again:
  // only files still on the source side move.
  async function moveApp(app, toEnc, onProgress = () => {}) {
    const src = (await allRecords(app, { internal: true })).filter((i) => i.enc !== toEnc);
    let done = 0;
    for (const item of src) {
      const { bytes } = await get(app, item.id, { internal: true });
      // the new copy is written using the target mode explicitly, whatever the app's state says right now
      const saved = await moveOne(app, item, bytes, toEnc);
      await destroy(item);
      done += 1;
      onProgress(done, src.length, saved);
    }
    return src.length;
  }

  async function moveOne(app, item, bytes, toEnc) {
    const id = newId();
    let stored = bytes, fileKey = "";
    if (toEnc) { const fk = await newFileKey(vault.key(), id); stored = await sealBytes(fk.key, bytes, "file|" + id); fileKey = fk.wrapped; }
    const parts = await upload(app, id, stored, toEnc ? "application/octet-stream" : item.mime);
    const hash = await sha256Hex(stored);
    const col = toEnc ? encCol : plainCol;
    await col.put(id, { App: app, Name: item.name, Mime: item.mime, Size: bytes.length, Parts: parts, Hash: hash, Photo: item.photo, TrashedAt: item.trashedAt, FileKey: fileKey });
    return id;
  }

  return {
    init: countPending,
    flush,
    put: (app, input, opts) => putInternal(app, input, opts),
    putAndWait: (app, input, opts) => putInternal(app, input, { ...opts, wait: true }),
    // permanent delete right now (skips the 30-day trash). The bytes go to the Drive bin.
    deleteNow: async (app, id) => destroy(await find(app, id)),
    list: async (app, { trashed = false } = {}) => (await allRecords(app)).filter((i) => (i.trashedAt > 0) === trashed),
    get, trash: (app, id) => setTrashed(app, id, now()), restore: (app, id) => setTrashed(app, id, 0),
    purgeExpired, moveApp,
    pendingCount: () => pendingN,
  };
}
