// A complete simulated device: own IndexedDB, data layer, sync, Vault, files, migration, usage.
// Many devices can share one simulated Sheet + Drive (createBackend), like a phone and a tablet.
import { IDBFactory } from "fake-indexeddb";
import { createDb } from "../../src/core/db.js";
import { createData } from "../../src/core/data.js";
import { createSync } from "../../src/core/sync.js";
import { createVault } from "../../src/core/vault.js";
import { createCollections } from "../../src/core/vaultData.js";
import { createFiles } from "../../src/core/files.js";
import { createMigration } from "../../src/core/vaultMigrate.js";
import { createRekey } from "../../src/core/vaultRekey.js";
import { createUsage } from "../../src/core/usage.js";
import { SELFTEST, selftestFields, VAULT_TEST } from "../../src/core/selftest.js";

export const URL_ = "https://script.google.com/macros/s/TESTID/exec";
export const KEY = "K".repeat(48);
export const PASS = "correct horse battery staple";
export const ITER = 1000; // low on purpose: tests do not need a slow key derivation

export const demoFields = { Title: "text", Body: "text", Count: "number", Done: "bool", Tags: "json" };

// Adds a fake "demoapp" (collection notes, files allowed) to the simulated backend's handler list.
export function addDemoApp(backend) {
  backend.run(`GRIM_HANDLERS.demoapp = function () { return { tabs: ["notes"], files: true }; };`);
}

export function makeDevice(backend, { name = "dev", type = "phone", clock = () => Date.now(), factory = new IDBFactory(), shrink, apps = ["selftest", "demoapp"], defaults = {} } = {}) {
  const db = createDb({ factory });
  const data = createData({ db, now: () => clock() });
  const cfg = { url: URL_, key: KEY };
  const calls = [];
  const sync = createSync({
    data, db, getConfig: () => cfg, getApps: () => apps, getDeviceId: () => name,
    fetchFn: async (url, init) => { calls.push(JSON.parse(init.body)); return backend.fetch(url, init); },
    beaconFn: () => true, now: () => clock(),
  });
  const vault = createVault({ data, db, sync, getDeviceType: () => type, defaults, iterations: ITER });
  const { defineCollection, collectionsFor } = createCollections({ data, vault });
  const files = createFiles({ data, db, vault, sync, shrink: shrink || (async (b) => ({ bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg" })), now: () => clock() });
  const migration = createMigration({ data, vault, sync, files, collectionsFor });
  const usage = createUsage({ sync, db, now: () => clock() });
  const rekey = createRekey({ data, db, vault, sync, files, collectionsFor, getAppsOnDevice: () => apps, allApps: [{ id: "demoapp", name: "Demo" }], now: () => clock() });
  const items = data.define({ ...SELFTEST, fields: selftestFields, onDemand: true });
  const vaulted = defineCollection({ ...VAULT_TEST, fields: selftestFields, alwaysVault: true });
  const notes = defineCollection({ app: "demoapp", name: "notes", fields: demoFields });
  const dev = { name, type, db, data, sync, vault, files, migration, rekey, usage, items, vaulted, notes, defineCollection, collectionsFor, calls, cfg, factory };
  dev.restart = async () => { // a fresh app launch on the same stored data
    const d2 = makeDevice(backend, { name, type, clock, factory, shrink, apps, defaults });
    await d2.vault.init(); await d2.files.init();
    return d2;
  };
  dev.boot = async () => { await vault.init(); await files.init(); return dev; };
  return dev;
}
