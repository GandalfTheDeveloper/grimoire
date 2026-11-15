// Wires the shared core together once. The shell and apps import from here.
import { createDb } from "./db.js";
import { createData } from "./data.js";
import { createSync } from "./sync.js";
import { loadSyncConfig, getDeviceId } from "./syncConfig.js";
import { loadAppsOnDevice } from "./deviceSettings.js";
import { defineSelftest } from "./selftest.js";
import { setSyncStatus } from "./syncStatus.js";

export const db = createDb();
export const data = createData({ db });
export const sync = createSync({ data, db, getConfig: loadSyncConfig, getApps: loadAppsOnDevice, getDeviceId });
export const selftestCol = defineSelftest(data);

// Apps declare their collections in their meta file; the shell registers them here.
export function registerAppCollections(apps) {
  for (const a of apps) for (const c of a.collections || []) data.define({ app: a.id, ...c });
}

export async function initCore() {
  await db.open();
  const c = loadSyncConfig();
  setSyncStatus({ configured: !!(c.url && c.key) });
}
