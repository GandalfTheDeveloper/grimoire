// The Hoard's data: real records (Grimoire records, encrypted by the Vault) or demo records (this device
// only, never synced). Both have the same shape { id, type, data, createdAt, updatedAt }, so every screen
// runs the same code in demo mode.
//
// One shared copy in memory, so the app and its settings panel (open on top of it) always agree.
import { useEffect, useSyncExternalStore } from "react";
import { collectionsFor, data as coreData } from "../../core/index.js";
import { newId } from "../../core/data.js";
import { getItem, setItem } from "../../core/storage.js";
import { fromRecord, toFields, TYPES } from "./schema.js";
import { demoRecords } from "./demo.js";

export const APP_ID = "budget";
const DEMO_KEY = "demo";

const handle = () => collectionsFor(APP_ID).find((c) => c.name === "data");

// ---------- demo store (charter: labelled, stored separately, never touches the Sheet) ----------
export function loadDemo() {
  const d = getItem(APP_ID, DEMO_KEY, null);
  return d && Array.isArray(d.records) ? { on: !!d.on, records: d.records } : { on: false, records: [] };
}
const saveDemo = (d) => setItem(APP_ID, DEMO_KEY, d);

// ---------- shared state ----------
let state = { demoOn: loadDemo().on, demo: loadDemo().records, real: [], loaded: false, error: "" };
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getSnapshot = () => state;

// A reload that started before one of our own writes finished would put the older list back on screen,
// so every write bumps a counter and a reload whose counter moved reads again.
let gen = 0;
export async function reloadReal() {
  const h = handle();
  if (!h) return;
  for (let tries = 0; tries < 5; tries++) {
    const g = gen;
    try {
      const list = await h.list();
      if (g !== gen) continue;
      set({ real: list.map(fromRecord).filter((r) => TYPES.includes(r.type)), loaded: true, error: "" });
      return;
    } catch (e) {
      set({ loaded: true, error: e && e.message ? e.message : "Could not read The Hoard's records" });
      return;
    }
  }
}

// ---------- writes ----------
// put(id or null, type, data). In demo mode it only ever writes the demo store.
export async function put(id, type, dataObj, { real = false } = {}) {
  if (!TYPES.includes(type)) throw new Error(`unknown record type ${type}`);
  if (state.demoOn && !real) {
    const now = Date.now();
    const recId = id || `demo-${newId()}`;
    const prev = state.demo.find((r) => r.id === recId);
    const rec = { id: recId, type, data: dataObj, createdAt: prev ? prev.createdAt : now, updatedAt: Math.max(now, prev ? prev.updatedAt + 1 : 0), demo: true };
    const demo = prev ? state.demo.map((r) => (r.id === recId ? rec : r)) : [...state.demo, rec];
    saveDemo({ on: true, records: demo });
    set({ demo });
    return rec;
  }
  gen += 1;
  const saved = await handle().put(id, toFields(type, dataObj));
  gen += 1;
  const rec = fromRecord(saved);
  set({ real: [...state.real.filter((r) => r.id !== rec.id), rec] });
  return rec;
}

export async function remove(id) {
  if (state.demoOn) {
    const demo = state.demo.filter((r) => r.id !== id);
    saveDemo({ on: true, records: demo });
    set({ demo });
    return;
  }
  gen += 1;
  await handle().remove(id);
  gen += 1;
  set({ real: state.real.filter((r) => r.id !== id) });
}

// Several changes in a row (reorder, delete a line with all its versions). Each one is saved on its own.
export async function putMany(list) { for (const x of list) await put(x.id, x.type, x.data); }
export async function removeMany(ids) { for (const id of ids) await remove(id); }

// ---------- demo mode ----------
export function setDemoOn(on) {
  const cur = loadDemo();
  const records = on && cur.records.length === 0 ? demoRecords() : cur.records;
  saveDemo({ on, records });
  set({ demoOn: on, demo: records });
}
// Clear demo data: only ever touches the demo store.
export function clearDemo() {
  saveDemo({ on: false, records: [] });
  set({ demoOn: false, demo: [] });
}

// The real records, whatever mode is on (the seed import always writes real records).
export const realRecords = () => state.real;

// for tests: forget the in-memory copy and read the device again
export function resetStoreCache() {
  gen += 1; // a read still on its way from before must not land
  const d = loadDemo();
  state = { demoOn: d.on, demo: d.records, real: [], loaded: false, error: "" };
  listeners.forEach((l) => l());
}

export function useHoard() {
  const s = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    reloadReal();
    return coreData.subscribe((info) => { if (info.app === APP_ID) reloadReal(); });
  }, []);
  return { records: s.demoOn ? s.demo : s.real, demoOn: s.demoOn, loaded: s.loaded || s.demoOn, error: s.demoOn ? "" : s.error };
}
