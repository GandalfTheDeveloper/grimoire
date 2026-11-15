import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createDb } from "../src/core/db.js";
import { createData, newId } from "../src/core/data.js";
import { createSync } from "../src/core/sync.js";
import { selftestFields, defineSelftest, runSelfTest, clearSelfTest } from "../src/core/selftest.js";
import { getSyncStatus, setSyncStatus } from "../src/core/syncStatus.js";
import { createBackend } from "./sim/sheetsSim.js";

const URL_ = "https://script.google.com/macros/s/TESTID/exec";
const KEY = "K".repeat(48);
const devices = [];

function readBlob(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(blob); });
}

// A full device: its own IndexedDB, data layer and sync engine, talking to the shared simulated Sheet.
function makeDevice(backend, { name = "dev", key = KEY, clock = () => Date.now(), apps = ["selftest"], onDemand = false } = {}) {
  const db = createDb({ factory: new IDBFactory() });
  const data = createData({ db, now: () => clock() });
  const col = data.define({ app: "selftest", name: "items", fields: selftestFields, onDemand });
  const cfg = { url: URL_, key };
  const calls = [];
  const beacons = [];
  const sync = createSync({
    data, db, getConfig: () => cfg, getApps: () => apps, getDeviceId: () => name,
    fetchFn: async (url, init) => { calls.push({ url, init }); return backend.fetch(url, init); },
    beaconFn: (url, blob) => { beacons.push({ url, blob }); return true; },
    now: () => clock(),
  });
  const dev = { db, data, col, cfg, sync, calls, beacons, name };
  devices.push(dev);
  return dev;
}

let backend;
beforeEach(() => {
  backend = createBackend({ key: KEY });
  setSyncStatus({ pending: 0, lastSync: null, errors: [], syncing: false, lastError: null, configured: false, backendVersion: null });
});
afterEach(() => { while (devices.length) devices.pop().sync.stop(); });

const sheetRows = () => backend.rows("selftest_items");

describe("data layer", () => {
  it("round-trips typed values and keeps ids, times and soft deletes", async () => {
    const d = makeDevice(backend);
    const a = await d.col.put(null, { Label: "a", Amount: 187.4, Flag: true, Clock: "8:45" });
    expect(a.id).toMatch(/^[a-f0-9]{32}$/);
    expect(await d.col.get(a.id)).toMatchObject({ Label: "a", Amount: 187.4, Flag: true, Clock: "8:45" });
    await d.col.put(a.id, { Amount: 0 });
    expect((await d.col.get(a.id)).Label).toBe("a"); // merge keeps other fields
    expect((await d.col.get(a.id)).Amount).toBe(0);
    expect(await d.col.remove(a.id)).toBe(true);
    expect(await d.col.get(a.id)).toBeNull();
    expect(await d.col.list()).toEqual([]);
    expect(await d.db.all()).toHaveLength(1); // still there, flagged
    expect((await d.db.all())[0].deleted).toBe(1);
  });
  it("UpdatedAt always moves forward, even if the clock stands still or goes back", async () => {
    let t = 5000;
    const d = makeDevice(backend, { clock: () => t });
    const r1 = await d.col.put(null, { Label: "1" });
    const r2 = await d.col.put(r1.id, { Label: "2" });
    t = 1000;
    const r3 = await d.col.put(r1.id, { Label: "3" });
    expect(r2.updatedAt).toBeGreaterThan(r1.updatedAt);
    expect(r3.updatedAt).toBeGreaterThan(r2.updatedAt);
    expect(r3.createdAt).toBe(r1.createdAt);
  });
  it("serializes overlapping writes to the same record", async () => {
    const d = makeDevice(backend);
    const { id } = await d.col.put(null, { Amount: 0 });
    await Promise.all(Array.from({ length: 25 }, (_, i) => d.col.put(id, { Amount: i + 1, Label: `n${i}` })));
    const rec = await d.col.get(id);
    expect(rec.Amount).toBe(25);
    expect(rec.Label).toBe("n24");
    expect(d.data.pendingCount()).toBe(1);
  });
  it("rejects bad names and envelope clashes", () => {
    const d = makeDevice(backend);
    expect(() => d.data.define({ app: "Bad", name: "x", fields: {} })).toThrow();
    expect(() => d.data.define({ app: "ok", name: "x", fields: { Id: "text" } })).toThrow();
    expect(() => d.data.define({ app: "ok", name: "x", fields: { "a b": "text" } })).toThrow();
    expect(() => d.data.define({ app: "ok", name: "x", fields: { A: "date" } })).toThrow();
  });
  it("upgrades older records when read, without rewriting them", async () => {
    const d = makeDevice(backend);
    const col = d.data.define({ app: "selftest", name: "items", fields: selftestFields, schemaVersion: 2, upgrade: (v, from) => (from < 2 ? { ...v, Label: v.Label + "!" } : v) });
    await d.db.put({ pk: "selftest|items|oldrecord1", cid: "selftest|items", app: "selftest", coll: "items", id: "oldrecord1", createdAt: 1, updatedAt: 1, syncedAt: 0, deleted: 0, schemaVersion: 1, cols: { Label: "old" }, dirty: 0 });
    expect((await col.get("oldrecord1")).Label).toBe("old!");
    expect((await d.db.get("selftest|items|oldrecord1")).schemaVersion).toBe(1);
  });
  it("falls back to memory when IndexedDB is unavailable", async () => {
    const db = createDb({ factory: null });
    await db.open();
    expect(db.mode).toBe("memory");
    const data = createData({ db });
    const col = data.define({ app: "selftest", name: "items", fields: selftestFields });
    const r = await col.put(null, { Label: "m" });
    expect((await col.get(r.id)).Label).toBe("m");
    expect(createDb({ factory: new IDBFactory() }).mode).toBe("opening");
    const idb = createDb({ factory: new IDBFactory() });
    await idb.open();
    expect(idb.mode).toBe("indexeddb");
  });
  it("survives a reload: pending records are still pending afterwards", async () => {
    const factory = new IDBFactory();
    const db1 = createDb({ factory });
    const d1 = createData({ db: db1 });
    await d1.define({ app: "selftest", name: "items", fields: selftestFields }).put(null, { Label: "kept" });
    const db2 = createDb({ factory }); // same browser storage, fresh page
    const d2 = createData({ db: db2 });
    d2.define({ app: "selftest", name: "items", fields: selftestFields });
    expect(await d2.hydrate()).toBe(1);
  });
});

describe("saving never waits and never loses", () => {
  it("works with no connection configured: edits pile up as pending, nothing throws, nothing is sent", async () => {
    const d = makeDevice(backend);
    d.cfg.url = ""; d.cfg.key = "";
    await d.col.put(null, { Label: "a" }); await d.col.put(null, { Label: "b" }); await d.col.put(null, { Label: "c" });
    await d.sync.syncNow();
    expect(d.data.pendingCount()).toBe(3);
    expect(d.calls).toHaveLength(0);
    expect(getSyncStatus().configured).toBe(false);
    expect(getSyncStatus().pending).toBe(3);
    d.cfg.url = URL_; d.cfg.key = KEY;
    await d.sync.syncNow();
    expect(d.data.pendingCount()).toBe(0);
    expect(sheetRows()).toHaveLength(3);
    expect(getSyncStatus().lastSync).toBeTruthy();
    expect(getSyncStatus().backendVersion).toBe("0.2.0");
  });
  it("keeps edits when offline, reports it without leaking content, and catches up later", async () => {
    const d = makeDevice(backend);
    await d.col.put(null, { Label: "SECRET-LABEL" });
    backend.offline = true;
    await d.sync.syncNow();
    expect(d.data.pendingCount()).toBe(1);
    expect(getSyncStatus().lastError).toMatch(/No connection/);
    expect(getSyncStatus().errors.join(" ")).not.toMatch(/SECRET-LABEL/);
    backend.offline = false;
    await d.sync.syncNow();
    expect(d.data.pendingCount()).toBe(0);
    expect(sheetRows()[0].Label).toBe("SECRET-LABEL");
    expect(getSyncStatus().lastError).toBeNull();
  });
  it("a wrong key is reported plainly and nothing is lost or written", async () => {
    const d = makeDevice(backend, { key: "W".repeat(48) });
    await d.col.put(null, { Label: "a" });
    await d.sync.syncNow();
    expect(getSyncStatus().lastError).toBe("The key was rejected");
    expect(d.data.pendingCount()).toBe(1);
    expect(backend.sheets.size).toBe(0);
  });
  it("a URL that answers with a web page (wrong URL or access setting) gets a helpful message", async () => {
    const d = makeDevice(backend);
    await d.col.put(null, { Label: "a" });
    const bad = createSync({ data: d.data, db: d.db, getConfig: () => d.cfg, getApps: () => ["selftest"], getDeviceId: () => "x", fetchFn: async () => ({ json: async () => { throw new SyntaxError("<html"); } }) });
    await bad.syncNow();
    bad.stop();
    expect(getSyncStatus().lastError).toMatch(/did not answer like Grimoire/);
    expect(d.data.pendingCount()).toBe(1);
  });
  it("an edit made while a request is in flight stays pending and is sent next time", async () => {
    const d = makeDevice(backend);
    const r = await d.col.put(null, { Label: "first" });
    let once = true;
    backend.beforeRespond = async () => { if (once) { once = false; await d.col.put(r.id, { Label: "second" }); } };
    await d.sync.syncNow();
    expect(d.data.pendingCount()).toBe(1);
    backend.beforeRespond = null;
    await d.sync.syncNow();
    expect(d.data.pendingCount()).toBe(0);
    expect(sheetRows()[0].Label).toBe("second");
  });
  it("sends large backlogs in pages and ends at zero pending", async () => {
    const d = makeDevice(backend);
    for (let i = 0; i < 250; i++) await d.col.put(null, { Label: `l${i}` });
    await d.sync.syncNow();
    expect(d.data.pendingCount()).toBe(0);
    expect(sheetRows()).toHaveLength(250);
    expect(d.calls.length).toBeGreaterThanOrEqual(3);
  });
  it("a record the Sheet refuses stays pending and is reported, and does not loop forever", async () => {
    const d = makeDevice(backend);
    await d.col.put(null, { Label: "x".repeat(46000) });
    await d.col.put(null, { Label: "fine" });
    await d.sync.syncNow();
    expect(d.data.pendingCount()).toBe(1);
    expect(getSyncStatus().errors.join(" ")).toMatch(/refused by the Sheet/);
    expect(d.calls.length).toBeLessThanOrEqual(2);
  });
  it("the key travels in the request body, never in the URL, and the content type avoids a CORS preflight", async () => {
    const d = makeDevice(backend);
    await d.col.put(null, { Label: "a" });
    await d.sync.syncNow();
    for (const c of d.calls) {
      expect(c.url).toBe(URL_);
      expect(c.url).not.toContain(KEY);
      expect(c.init.method).toBe("POST");
      expect(c.init.headers["Content-Type"]).toBe("text/plain;charset=utf-8");
      expect(JSON.parse(c.init.body).key).toBe(KEY);
    }
  });
  it("still sends changes for an app turned off on this device, but does not pull it", async () => {
    const other = makeDevice(backend, { name: "other" });
    await other.col.put(null, { Label: "from-other" });
    await other.sync.syncNow();
    const d = makeDevice(backend, { apps: [] });
    await d.col.put(null, { Label: "mine" });
    await d.sync.syncNow();
    expect(sheetRows()).toHaveLength(2);
    expect(await d.col.list()).toHaveLength(1); // did not pull "from-other"
  });
  it("on-demand collections stay out of normal syncs until used (no stray tab in the Sheet)", async () => {
    const d = makeDevice(backend, { onDemand: true });
    await d.sync.syncNow();
    expect(d.calls).toHaveLength(0);
    expect(backend.sheets.size).toBe(0);
  });
});

describe("two devices", () => {
  it("converge: new records, edits and deletes flow both ways", async () => {
    const phone = makeDevice(backend, { name: "phone" });
    const tablet = makeDevice(backend, { name: "tablet" });
    const a = await phone.col.put(null, { Label: "from phone" });
    await phone.sync.syncNow(); await tablet.sync.syncNow();
    expect((await tablet.col.get(a.id)).Label).toBe("from phone");
    await tablet.col.put(a.id, { Label: "edited on tablet" });
    const b2 = await tablet.col.put(null, { Label: "tablet new" });
    await tablet.sync.syncNow(); await phone.sync.syncNow();
    expect((await phone.col.get(a.id)).Label).toBe("edited on tablet");
    expect((await phone.col.get(b2.id)).Label).toBe("tablet new");
    await phone.col.remove(a.id);
    await phone.sync.syncNow(); await tablet.sync.syncNow();
    expect(await tablet.col.get(a.id)).toBeNull();
    expect((await tablet.col.list()).map((r) => r.id)).toEqual([b2.id]);
    expect(phone.data.pendingCount() + tablet.data.pendingCount()).toBe(0);
  });
  it("newest edit wins when both edited the same record while apart, and the loser is told", async () => {
    let tp = 1000, tt = 1000;
    const phone = makeDevice(backend, { name: "phone", clock: () => tp });
    const tablet = makeDevice(backend, { name: "tablet", clock: () => tt });
    const r = await phone.col.put(null, { Label: "base" });
    await phone.sync.syncNow(); await tablet.sync.syncNow();
    tp = 2000; await phone.col.put(r.id, { Label: "phone edit" });
    tt = 3000; await tablet.col.put(r.id, { Label: "tablet edit (newer)" });
    await tablet.sync.syncNow(); // newer lands first
    await phone.sync.syncNow(); // older arrives second and loses
    expect(sheetRows()[0].Label).toBe("tablet edit (newer)");
    expect((await phone.col.get(r.id)).Label).toBe("tablet edit (newer)");
    expect(phone.data.pendingCount()).toBe(0);
    expect(getSyncStatus().errors.join(" ")).toMatch(/newer edit from another device replaced one here/);
  });
  it("same, in the other order: an older edit arriving later does not clobber a newer one", async () => {
    let tp = 1000, tt = 1000;
    const phone = makeDevice(backend, { name: "phone", clock: () => tp });
    const tablet = makeDevice(backend, { name: "tablet", clock: () => tt });
    const r = await phone.col.put(null, { Label: "base" });
    await phone.sync.syncNow(); await tablet.sync.syncNow();
    tp = 2000; await phone.col.put(r.id, { Label: "phone edit (older)" });
    tt = 3000; await tablet.col.put(r.id, { Label: "tablet edit (newer)" });
    await phone.sync.syncNow(); // older lands first
    await tablet.sync.syncNow(); // newer replaces it
    await phone.sync.syncNow();
    expect(sheetRows()[0].Label).toBe("tablet edit (newer)");
    expect((await phone.col.get(r.id)).Label).toBe("tablet edit (newer)");
  });
  it("a newer unsynced edit on this device is not overwritten by an older version arriving from the Sheet", async () => {
    let tp = 1000, tt = 1000;
    const phone = makeDevice(backend, { name: "phone", clock: () => tp });
    const tablet = makeDevice(backend, { name: "tablet", clock: () => tt });
    const r = await phone.col.put(null, { Label: "base" });
    await phone.sync.syncNow(); await tablet.sync.syncNow();
    tt = 2000; await tablet.col.put(r.id, { Label: "tablet edit (older)" });
    await tablet.sync.syncNow();
    // the phone edits while its own sync request is already in flight, so the edit is not in that request
    let once = true;
    backend.beforeRespond = async () => { if (once) { once = false; tp = 3000; await phone.col.put(r.id, { Label: "phone edit (newer)" }); } };
    await phone.sync.syncNow();
    backend.beforeRespond = null;
    expect((await phone.col.get(r.id)).Label).toBe("phone edit (newer)");
    expect(phone.data.pendingCount()).toBe(1);
    await phone.sync.syncNow(); await tablet.sync.syncNow();
    expect(sheetRows()[0].Label).toBe("phone edit (newer)");
    expect((await tablet.col.get(r.id)).Label).toBe("phone edit (newer)");
  });
  it("an edit made offline long ago still reaches a device that already synced past it (SyncedAt cursor)", async () => {
    const phone = makeDevice(backend, { name: "phone", clock: () => 100 }); // phone clock is far behind
    const tablet = makeDevice(backend, { name: "tablet" });
    await tablet.col.put(null, { Label: "tablet record" });
    await tablet.sync.syncNow();
    await phone.col.put(null, { Label: "old offline edit" }); // UpdatedAt = 100, far older than the tablet's cursor
    await phone.sync.syncNow();
    await tablet.sync.syncNow();
    expect((await tablet.col.list()).map((r) => r.Label).sort()).toEqual(["old offline edit", "tablet record"]);
  });
  it("downloads only what changed: a quiet second sync pulls no records", async () => {
    const phone = makeDevice(backend, { name: "phone" });
    const tablet = makeDevice(backend, { name: "tablet" });
    for (let i = 0; i < 30; i++) await phone.col.put(null, { Label: `p${i}` });
    await phone.sync.syncNow(); await tablet.sync.syncNow();
    tablet.calls.length = 0;
    const seen = [];
    backend.beforeRespond = async (_b, result) => seen.push(result.items[0].records.length);
    await tablet.sync.syncNow();
    expect(seen).toEqual([0]);
    await phone.col.put(null, { Label: "one more" });
    await phone.sync.syncNow();
    seen.length = 0;
    await tablet.sync.syncNow();
    expect(seen).toEqual([1]);
  });
  it("sync('open') only pulls the open app's collections", async () => {
    const d = makeDevice(backend, { apps: ["selftest"] });
    d.sync.setOpenApp("fitness");
    await d.sync.syncNow("open");
    expect(d.calls).toHaveLength(0); // nothing dirty, selftest is not the open app
    d.sync.setOpenApp("selftest");
    await d.sync.syncNow("open");
    expect(d.calls).toHaveLength(1);
  });
});

describe("restore from a Sheet backup", () => {
  it("a device whose cursor is ahead of a restored Sheet starts over, and Re-send everything repairs the Sheet", async () => {
    const d = makeDevice(backend);
    for (let i = 0; i < 5; i++) await d.col.put(null, { Label: `r${i}` });
    await d.sync.syncNow();
    expect(sheetRows()).toHaveLength(5);
    // the Sheet is replaced by an older, empty copy
    backend.sheets.clear();
    await d.sync.syncNow();
    expect(sheetRows()).toHaveLength(0);
    expect(await d.data.markAllDirty()).toBe(5);
    await d.sync.syncNow();
    expect(sheetRows()).toHaveLength(5);
    expect(d.data.pendingCount()).toBe(0);
    // another device gets everything from the restored Sheet
    const other = makeDevice(backend, { name: "other" });
    await other.sync.syncNow();
    expect(await other.col.list()).toHaveLength(5);
  });
});

describe("last-chance send when the app is hidden", () => {
  it("builds from memory with no waiting, puts the key in the body, and marks nothing as sent", async () => {
    const d = makeDevice(backend);
    for (let i = 0; i < 3; i++) await d.col.put(null, { Label: `b${i}` });
    const sent = d.sync.flushBeacon();
    expect(sent).toBe(3);
    expect(d.beacons).toHaveLength(1);
    expect(d.beacons[0].url).toBe(URL_);
    const body = JSON.parse(await readBlob(d.beacons[0].blob));
    expect(body).toMatchObject({ key: KEY, action: "sync", beacon: true });
    expect(body.items[0].records).toHaveLength(3);
    expect(d.data.pendingCount()).toBe(3);
    // the Sheet applies it without sending anything back
    const res = backend.post(body);
    expect(res.items[0].records).toEqual([]);
    expect(sheetRows()).toHaveLength(3);
    // later a normal sync confirms the same records; nothing is duplicated
    await d.sync.syncNow();
    expect(d.data.pendingCount()).toBe(0);
    expect(sheetRows()).toHaveLength(3);
  });
  it("splits big backlogs so each piece fits under the browser's size cap", async () => {
    const d = makeDevice(backend);
    for (let i = 0; i < 300; i++) await d.col.put(null, { Label: "x".repeat(400) });
    const sent = d.sync.flushBeacon();
    expect(sent).toBe(300);
    expect(d.beacons.length).toBeGreaterThan(1);
    let n = 0;
    for (const b of d.beacons) {
      expect(b.blob.size).toBeLessThanOrEqual(64000);
      n += JSON.parse(await readBlob(b.blob)).items.reduce((a, it) => a + it.records.length, 0);
    }
    expect(n).toBe(300);
  });
  it("does nothing when nothing is pending or nothing is configured", async () => {
    const d = makeDevice(backend);
    expect(d.sync.flushBeacon()).toBe(0);
    await d.col.put(null, { Label: "a" });
    d.cfg.url = "";
    expect(d.sync.flushBeacon()).toBe(0);
    expect(d.beacons).toHaveLength(0);
  });
  it("fires on pagehide once started, and stop() detaches everything", async () => {
    const d = makeDevice(backend);
    await d.col.put(null, { Label: "a" });
    d.sync.start();
    await new Promise((r) => setTimeout(r, 50));
    window.dispatchEvent(new Event("pagehide"));
    expect(d.beacons.length).toBeGreaterThanOrEqual(0); // already synced by start(), so possibly none
    await d.col.put(null, { Label: "b" });
    const before = d.beacons.length;
    window.dispatchEvent(new Event("pagehide"));
    expect(d.beacons.length).toBe(before + 1);
    d.sync.stop();
    await d.col.put(null, { Label: "c" });
    window.dispatchEvent(new Event("pagehide"));
    expect(d.beacons.length).toBe(before + 1);
  });
  it("saving triggers a background sync a moment later, with the status dot following", async () => {
    const d = makeDevice(backend);
    d.sync.start();
    await new Promise((r) => setTimeout(r, 50));
    await d.col.put(null, { Label: "auto" });
    expect(getSyncStatus().pending).toBe(1);
    await new Promise((r) => setTimeout(r, 1900));
    expect(getSyncStatus().pending).toBe(0);
    expect(sheetRows()).toHaveLength(1);
  });
});

describe("sync self-test", () => {
  it("passes against a Sheet that keeps plain text as text, then clears its fake rows", async () => {
    const d = makeDevice(backend, { onDemand: true });
    const col = d.col;
    const res = await runSelfTest({ col, sync: d.sync, data: d.data });
    expect(res).toEqual({ pass: true, checked: 21, mismatches: [] });
    expect(sheetRows()).toHaveLength(3);
    expect(await clearSelfTest({ col, sync: d.sync })).toBe(3);
    expect(sheetRows().every((r) => r.Deleted === 1)).toBe(true);
  });
  it("FAILS, naming the fields only, against a Sheet that converts values", async () => {
    backend = createBackend({ key: KEY, opts: { ignoreTextFormat: true } });
    const d = makeDevice(backend, { onDemand: true });
    const res = await runSelfTest({ col: d.col, sync: d.sync, data: d.data });
    expect(res.pass).toBe(false);
    expect(res.mismatches).toContain("times.Code");
    expect(res.mismatches).toContain("times.Formula");
    expect(res.mismatches.join(" ")).not.toMatch(/007|1\+1/); // names only, never values
  });
  it("is reported as not passing if the connection is down", async () => {
    const d = makeDevice(backend, { onDemand: true });
    backend.offline = true;
    const res = await runSelfTest({ col: d.col, sync: d.sync, data: d.data });
    expect(res.pass).toBe(false);
    expect(res.mismatches[0]).toMatch(/No connection/);
  });
  it("the real registered collection is on-demand", () => {
    const db = createDb({ factory: null });
    const data = createData({ db });
    defineSelftest(data);
    expect(data.getDef("selftest", "items").onDemand).toBe(true);
    expect(newId()).toHaveLength(32);
  });
});
