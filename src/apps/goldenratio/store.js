// Golden Ratio's data: synced history (Grimoire records), demo history (this device only), and the session
// (units and tape mode, which go back to the defaults after 30 minutes without use).
import { useCallback, useEffect, useState } from "react";
import { collectionsFor, data } from "../../core/index.js";
import { getItem, setItem } from "../../core/storage.js";
import { DEFAULT_UNIT } from "./units.js";
import { solve } from "./math.js";
import { toFields, fromRecord, isValidEntry } from "./schema.js";

export const APP_ID = "goldenratio";
export const SESSION_TTL = 30 * 60 * 1000;

// ---------- session: units and tape mode ----------
export const defaultSession = () => ({ units: { a: DEFAULT_UNIT, b: DEFAULT_UNIT, whole: DEFAULT_UNIT }, tape: false });

export function loadSession(now = Date.now()) {
  const s = getItem(APP_ID, "session", null);
  if (!s || typeof s.at !== "number" || now - s.at > SESSION_TTL || !s.units) return defaultSession();
  return { units: { ...defaultSession().units, ...s.units }, tape: !!s.tape };
}
export function saveSession(session, now = Date.now()) {
  setItem(APP_ID, "session", { units: session.units, tape: !!session.tape, at: now });
}
export const sessionExpired = (now = Date.now()) => {
  const s = getItem(APP_ID, "session", null);
  return !s || typeof s.at !== "number" || now - s.at > SESSION_TTL;
};

// ---------- demo history (charter: never touches the Sheet, labelled, stored separately) ----------
const DEMO_KEY = "demo";
export const loadDemo = () => {
  const d = getItem(APP_ID, DEMO_KEY, null);
  return d && Array.isArray(d.records) ? { on: !!d.on, records: d.records } : { on: false, records: [] };
};
const saveDemo = (d) => setItem(APP_ID, DEMO_KEY, d);

// A few made-up calculations covering every unit, tape mode and ft-in.
export function demoSeed(now = Date.now()) {
  const rows = [
    ["a", "10", { a: "in", b: "in", whole: "in" }, false, 254],
    ["b", "100", { a: "mm", b: "mm", whole: "mm" }, false, 100],
    ["whole", "5", { a: "mm", b: "mm", whole: "mm" }, false, 5],
    ["a", "3 5/8", { a: "in", b: "in", whole: "mm" }, true, 3.625 * 25.4],
    ["whole", "6' 8", { a: "ftin", b: "ftin", whole: "ftin" }, true, 80 * 25.4],
    ["b", "45", { a: "cm", b: "cm", whole: "m" }, false, 450],
    ["a", "2.5", { a: "ft", b: "in", whole: "ft" }, false, 2.5 * 304.8],
  ];
  return rows.map(([known, typed, units, tape, mm], i) => ({
    id: `demo-${i + 1}`, createdAt: now - (rows.length - i) * 3600000, demo: true,
    known, typed, units, tape, mm: solve(known, mm), source: APP_ID,
  }));
}

// ---------- the history hook ----------
const handle = () => collectionsFor(APP_ID).find((c) => c.name === "history");

export function useHistory() {
  const [real, setReal] = useState([]);
  const [demo, setDemo] = useState(loadDemo);

  const reload = useCallback(async () => {
    const h = handle();
    if (!h) return;
    try {
      const list = await h.list();
      setReal(list.map(fromRecord).filter(isValidEntry).sort((x, y) => x.createdAt - y.createdAt));
    } catch { /* the Vault guard can refuse while locked; this app is not in the Vault */ }
  }, []);

  useEffect(() => {
    reload();
    return data.subscribe((info) => { if (info.app === APP_ID) reload(); });
  }, [reload]);

  const add = useCallback(async (entry) => {
    if (!isValidEntry(entry)) return;
    if (demo.on) {
      const next = { ...demo, records: [...demo.records, { ...entry, id: `demo-${Date.now()}`, createdAt: Date.now(), demo: true }] };
      saveDemo(next); setDemo(next);
      return;
    }
    await handle().put(null, toFields(entry));
  }, [demo]);

  const remove = useCallback(async (entry) => {
    if (entry.demo) {
      const next = { ...demo, records: demo.records.filter((r) => r.id !== entry.id) };
      saveDemo(next); setDemo(next);
      return;
    }
    await handle().remove(entry.id);
  }, [demo]);

  const setDemoOn = useCallback((on) => {
    const cur = loadDemo();
    const next = { on, records: on && cur.records.length === 0 ? demoSeed() : cur.records };
    saveDemo(next); setDemo(next);
  }, []);

  // Clear demo data: only ever touches the demo store.
  const clearDemo = useCallback(() => { const next = { on: false, records: [] }; saveDemo(next); setDemo(next); }, []);

  return { items: demo.on ? demo.records : real, demoOn: demo.on, add, remove, setDemoOn, clearDemo };
}
