// On-device record store. IndexedDB when available, in-memory fallback otherwise (for example
// iOS private browsing). Same API either way; Diagnostics shows which one is active.
//
// A stored record looks like:
//   { pk, cid, app, coll, id, createdAt, updatedAt, syncedAt, deleted (0|1), schemaVersion,
//     cols (object of column name -> string), dirty (0|1) }
// "cols" is what goes in the Sheet columns: readable values, or { Payload } for Vault apps.

const STORE = "records";
const META = "meta";

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function memoryBackend() {
  const records = new Map();
  const meta = new Map();
  return {
    mode: "memory",
    async get(pk) { return records.get(pk) ? structuredClone(records.get(pk)) : undefined; },
    async put(rec) { records.set(rec.pk, structuredClone(rec)); },
    async putMany(list) { for (const r of list) records.set(r.pk, structuredClone(r)); },
    async byColl(cid) { return [...records.values()].filter((r) => r.cid === cid).map((r) => structuredClone(r)); },
    async dirty() { return [...records.values()].filter((r) => r.dirty === 1).map((r) => structuredClone(r)); },
    async all() { return [...records.values()].map((r) => structuredClone(r)); },
    async getMeta(k, fallback) { return meta.has(k) ? meta.get(k) : fallback; },
    async setMeta(k, v) { meta.set(k, v); },
  };
}

async function idbBackend(factory, name) {
  const db = await new Promise((resolve, reject) => {
    const open = factory.open(name, 1);
    open.onupgradeneeded = () => {
      const d = open.result;
      const s = d.createObjectStore(STORE, { keyPath: "pk" });
      s.createIndex("cid", "cid");
      s.createIndex("dirty", "dirty");
      d.createObjectStore(META, { keyPath: "k" });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error("blocked"));
  });
  const tx = (store, mode) => db.transaction(store, mode).objectStore(store);
  return {
    mode: "indexeddb",
    get: (pk) => reqP(tx(STORE, "readonly").get(pk)),
    async put(rec) { await reqP(tx(STORE, "readwrite").put(rec)); },
    async putMany(list) {
      await new Promise((resolve, reject) => {
        const t = db.transaction(STORE, "readwrite");
        const s = t.objectStore(STORE);
        for (const r of list) s.put(r);
        t.oncomplete = resolve;
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      });
    },
    byColl: (cid) => reqP(tx(STORE, "readonly").index("cid").getAll(cid)),
    dirty: () => reqP(tx(STORE, "readonly").index("dirty").getAll(1)),
    all: () => reqP(tx(STORE, "readonly").getAll()),
    async getMeta(k, fallback) {
      const row = await reqP(tx(META, "readonly").get(k));
      return row ? row.v : fallback;
    },
    async setMeta(k, v) { await reqP(tx(META, "readwrite").put({ k, v })); },
  };
}

// createDb({ factory }) -> promise-returning store. Pass a different IDBFactory in tests.
export function createDb({ factory, name = "grimoire" } = {}) {
  const f = factory === undefined ? (typeof indexedDB !== "undefined" ? indexedDB : null) : factory;
  let ready = null;
  let backend = null;
  const open = () => {
    if (!ready) {
      ready = (async () => {
        if (f) {
          try { backend = await idbBackend(f, name); return backend; } catch { /* fall through */ }
        }
        backend = memoryBackend();
        return backend;
      })();
    }
    return ready;
  };
  const wrap = (fn) => async (...a) => (await open())[fn](...a);
  return {
    open,
    get mode() { return backend ? backend.mode : "opening"; },
    get: wrap("get"),
    put: wrap("put"),
    putMany: wrap("putMany"),
    byColl: wrap("byColl"),
    dirty: wrap("dirty"),
    all: wrap("all"),
    getMeta: wrap("getMeta"),
    setMeta: wrap("setMeta"),
  };
}
