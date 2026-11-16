// Golden Ratio settings, synced to the Sheet (tab goldenratio_settings, one record) so they match on every device.
// One shared copy in memory, so the settings panel and the calculator (open underneath it) change at the same
// instant; the data layer saves it on the device and the sync engine sends it. Changes from another device
// arrive through the data layer and update the same copy.
import { useEffect, useSyncExternalStore } from "react";
import { collectionsFor, data } from "../../core/index.js";
import { SETTINGS_ID } from "./schema.js";

const APP = "goldenratio";
export const DEFAULT_SETTINGS = { hideDemo: false, copyUnit: true };

const handle = () => collectionsFor(APP).find((c) => c.name === "settings");

export const fromSettingsRecord = (r) => (r ? { hideDemo: !!r.HideDemo, copyUnit: r.CopyUnit !== "drop" } : { ...DEFAULT_SETTINGS });

let current = { ...DEFAULT_SETTINGS };
const listeners = new Set();
const setCurrent = (next) => {
  if (next.hideDemo === current.hideDemo && next.copyUnit === current.copyUnit) return;
  current = next;
  listeners.forEach((l) => l());
};
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getSnapshot = () => current;

let saving = 0; // while our own save is on its way, don't let a reload of the older copy flicker back
async function reload() {
  const h = handle();
  if (!h || saving) return;
  try { setCurrent(fromSettingsRecord(await h.get(SETTINGS_ID))); } catch { /* not in the Vault; nothing to do */ }
}

export async function updateSettings(patch) {
  const next = { ...current, ...patch };
  setCurrent(next);
  saving += 1;
  try { await handle().put(SETTINGS_ID, { HideDemo: !!next.hideDemo, CopyUnit: next.copyUnit ? "keep" : "drop" }); }
  finally { saving -= 1; }
}

// for tests: forget the in-memory copy (the stored record is the truth)
export const resetSettingsCache = () => { current = { ...DEFAULT_SETTINGS }; };

export function useGoldenSettings() {
  const s = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    reload();
    return data.subscribe((info) => { if (info.app === APP && info.coll === "settings") reload(); });
  }, []);
  return { ...s, update: updateSettings };
}
