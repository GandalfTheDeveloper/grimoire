// The shared data layer. Apps never talk to the Sheet; they read and write through a collection.
// Every edit is saved on the device first (marked dirty), then the sync engine sends it.
//
// Readable mode (default): each field becomes a Sheet column, stored as text and typed on the way back.
// Vault mode (Round 3): a codec turns all fields into one encrypted Payload column. Apps do not change.
//
// Charter rules this file enforces: unique ids, UpdatedAt on every record, deletes are flags,
// add fields but never rename or remove, schema version carried on each record.

export const ENVELOPE = ["Id", "CreatedAt", "UpdatedAt", "SyncedAt", "Deleted", "SchemaVersion"];
const NAME_RE = /^[a-z][a-z0-9]{0,19}$/;
const FIELD_RE = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;
const TYPES = ["text", "number", "bool", "json"];

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().replaceAll("-", "");
  let s = "";
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

export const tabName = (app, coll) => `${app}_${coll}`;

// ---- default (readable) codec: typed values <-> text columns ----
export const readableCodec = {
  encode(values, fields) {
    const cols = {};
    for (const [name, type] of Object.entries(fields)) {
      const v = values[name];
      if (v === undefined || v === null) cols[name] = "";
      else if (type === "number") cols[name] = String(v);
      else if (type === "bool") cols[name] = v ? "TRUE" : "FALSE";
      else if (type === "json") cols[name] = JSON.stringify(v);
      else cols[name] = String(v);
    }
    return cols;
  },
  decode(cols, fields) {
    const out = {};
    for (const [name, type] of Object.entries(fields)) {
      const raw = cols[name] == null ? "" : String(cols[name]);
      if (type === "number") { const n = raw === "" ? NaN : Number(raw); out[name] = Number.isFinite(n) ? n : null; }
      else if (type === "bool") out[name] = raw.toUpperCase() === "TRUE";
      else if (type === "json") { try { out[name] = raw === "" ? null : JSON.parse(raw); } catch { out[name] = null; } }
      else out[name] = raw;
    }
    return out;
  },
  columns(fields) { return Object.keys(fields); },
};

export function createData({ db, now = () => Date.now() }) {
  const defs = new Map(); // "app|coll" -> definition
  const dirtyMap = new Map(); // pk -> record (in-memory mirror so a last-chance send needs no waiting)
  const listeners = new Set();
  const writeListeners = new Set();
  let chain = Promise.resolve();
  const serial = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

  const pkOf = (app, coll, id) => `${app}|${coll}|${id}`;
  const notify = (info) => listeners.forEach((l) => { try { l(info); } catch { /* ignore */ } });

  function toPublic(def, rec) {
    const codec = def.codec;
    const values = codec.decode(rec.cols || {}, def.fields);
    const upgraded = def.upgrade && rec.schemaVersion < def.schemaVersion ? def.upgrade(values, rec.schemaVersion) : values;
    return { id: rec.id, createdAt: rec.createdAt, updatedAt: rec.updatedAt, ...upgraded };
  }

  function define(def) {
    if (!NAME_RE.test(def.app) || !NAME_RE.test(def.name)) throw new Error("app and collection names: lowercase letters and digits only");
    const fields = def.fields || {};
    for (const [n, t] of Object.entries(fields)) {
      if (!FIELD_RE.test(n) || ENVELOPE.includes(n)) throw new Error(`bad field name: ${n}`);
      if (!TYPES.includes(t)) throw new Error(`bad field type for ${n}`);
    }
    const full = { schemaVersion: 1, codec: readableCodec, ...def, fields };
    defs.set(`${def.app}|${def.name}`, full);
    const cid = `${def.app}|${def.name}`;

    return {
      def: full,
      async put(id, values) {
        return serial(async () => {
          const recId = id || newId();
          const pk = pkOf(def.app, def.name, recId);
          const prev = await db.get(pk);
          const prevValues = prev ? full.codec.decode(prev.cols || {}, fields) : {};
          const merged = { ...prevValues, ...values };
          const t = Math.max(now(), prev ? prev.updatedAt + 1 : 0); // always moves forward, even on a slow clock
          const rec = {
            pk, cid, app: def.app, coll: def.name, id: recId,
            createdAt: prev ? prev.createdAt : t,
            updatedAt: t,
            syncedAt: prev ? prev.syncedAt || 0 : 0,
            deleted: 0,
            schemaVersion: full.schemaVersion,
            cols: full.codec.encode(merged, fields),
            dirty: 1,
          };
          await db.put(rec);
          dirtyMap.set(pk, rec);
          notify({ app: def.app, coll: def.name, id: recId });
          writeListeners.forEach((l) => l());
          return toPublic(full, rec);
        });
      },
      async get(id) {
        const rec = await db.get(pkOf(def.app, def.name, id));
        return rec && !rec.deleted ? toPublic(full, rec) : null;
      },
      async list() {
        return (await db.byColl(cid)).filter((r) => !r.deleted).map((r) => toPublic(full, r)).sort((a, b) => a.createdAt - b.createdAt);
      },
      async remove(id) {
        return serial(async () => {
          const pk = pkOf(def.app, def.name, id);
          const prev = await db.get(pk);
          if (!prev || prev.deleted) return false;
          const rec = { ...prev, deleted: 1, updatedAt: Math.max(now(), prev.updatedAt + 1), dirty: 1 };
          await db.put(rec);
          dirtyMap.set(pk, rec);
          notify({ app: def.app, coll: def.name, id });
          writeListeners.forEach((l) => l());
          return true;
        });
      },
    };
  }

  return {
    define,
    collections: () => [...defs.values()],
    getDef: (app, coll) => defs.get(`${app}|${coll}`),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onWrite(fn) { writeListeners.add(fn); return () => writeListeners.delete(fn); },
    pendingCount: () => dirtyMap.size,
    // synchronous snapshot, used for the last-chance send when the app is hidden
    dirtySnapshot: () => [...dirtyMap.values()],
    async hydrate() {
      dirtyMap.clear();
      for (const r of await db.dirty()) dirtyMap.set(r.pk, r);
      return dirtyMap.size;
    },
    // Called by the sync engine after the Sheet confirms receipt. Stays dirty if edited meanwhile.
    async markSynced(pk, updatedAt, syncedAt) {
      return serial(async () => {
        const cur = await db.get(pk);
        if (!cur) return;
        if (cur.updatedAt === updatedAt) {
          const next = { ...cur, dirty: 0, syncedAt: syncedAt || cur.syncedAt || 0 };
          await db.put(next);
          dirtyMap.delete(pk);
        }
      });
    },
    // Called by the sync engine with a record from the Sheet. Newest UpdatedAt wins.
    // Returns "applied", "kept-local" (local newer, still pending) or "same".
    async applyServer(app, coll, s) {
      return serial(async () => {
        const pk = pkOf(app, coll, s.id);
        const cur = await db.get(pk);
        if (cur && cur.dirty && cur.updatedAt > s.updatedAt) return "kept-local";
        if (cur && !cur.dirty && cur.updatedAt === s.updatedAt && cur.deleted === (s.deleted ? 1 : 0)) {
          if (cur.syncedAt !== s.syncedAt) await db.put({ ...cur, syncedAt: s.syncedAt });
          return "same";
        }
        if (cur && !cur.dirty && cur.updatedAt > s.updatedAt) return "same";
        const rec = {
          pk, cid: `${app}|${coll}`, app, coll, id: s.id,
          createdAt: s.createdAt, updatedAt: s.updatedAt, syncedAt: s.syncedAt || 0,
          deleted: s.deleted ? 1 : 0, schemaVersion: s.schemaVersion || 1,
          cols: s.cols || {}, dirty: 0,
        };
        const overwroteLocalEdit = !!(cur && cur.dirty);
        await db.put(rec);
        dirtyMap.delete(pk);
        notify({ app, coll, id: s.id });
        return overwroteLocalEdit ? "overwrote-local" : "applied";
      });
    },
    // Recovery tool: mark every record dirty so the next sync re-sends everything (safe, upserts are idempotent).
    async markAllDirty() {
      return serial(async () => {
        const all = await db.all();
        const next = all.map((r) => ({ ...r, dirty: 1 }));
        await db.putMany(next);
        for (const r of next) dirtyMap.set(r.pk, r);
        writeListeners.forEach((l) => l());
        return next.length;
      });
    },
    async counts() {
      const out = {};
      for (const r of await db.all()) {
        const k = tabName(r.app, r.coll);
        out[k] = out[k] || { total: 0, deleted: 0 };
        out[k].total += 1;
        if (r.deleted) out[k].deleted += 1;
      }
      return out;
    },
  };
}
