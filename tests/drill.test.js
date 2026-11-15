import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createBackend } from "./sim/sheetsSim.js";
import { makeDevice, addDemoApp, PASS, KEY } from "./helpers/device.js";
import { setSyncStatus } from "../src/core/syncStatus.js";
import { prepareDrill, checkDrill, runPhotoTest } from "../src/core/selftest.js";

let backend;
const devices = [];
const dev = async (o) => { const d = makeDevice(backend, o); devices.push(d); await d.boot(); return d; };
beforeEach(() => {
  backend = createBackend({ key: KEY });
  addDemoApp(backend);
  setSyncStatus({ pending: 0, lastSync: null, errors: [], syncing: false, lastError: null, configured: false, backendVersion: null });
});
afterEach(() => { while (devices.length) devices.pop().sync.stop(); });

const p1 = (d) => prepareDrill({ col: d.vaulted, sync: d.sync, vault: d.vault, data: d.data, deviceId: d.name });
const p2 = (d) => checkDrill({ col: d.vaulted, sync: d.sync, vault: d.vault, data: d.data, deviceId: d.name, collectionsFor: d.collectionsFor });

describe("recovery drill", () => {
  it("passes end to end: phone prepares, locks; tablet unlocks with the passphrase, reads, exports, loses its copy, imports", async () => {
    const a = await dev({ name: "phone", type: "phone" });
    const b = await dev({ name: "tablet", type: "tablet" });
    await a.vault.setup(PASS);
    const r1 = await p1(a);
    expect(r1.pass).toBe(true);
    expect(r1.text).toMatch(/Lock now/);
    await a.vault.lock();
    await b.sync.syncNow("all");
    expect((await p2(b)).text).toMatch(/Unlock the Vault first/); // locked tablet is told to unlock
    await b.vault.unlock(PASS);
    const r2 = await p2(b);
    expect(r2.text).toMatch(/passed/);
    expect(r2.pass).toBe(true);
    expect(r2.text).toMatch(/all 5 records/);
    // nothing readable was ever in the Sheet
    const sheet = JSON.stringify(backend.rows("selftest_vaultedenc"));
    expect(sheet).not.toContain("drill-");
    // the drill cleaned up after itself: no live drill record is left in the Sheet
    expect(backend.rows("selftest_vaultedenc").filter((r) => r.Deleted === 0)).toHaveLength(0);
  });

  it("step 2 on the same device that prepared the drill is refused", async () => {
    const a = await dev({ name: "phone" });
    await a.vault.setup(PASS);
    await p1(a);
    const r = await p2(a);
    expect(r.pass).toBe(false);
    expect(r.text).toMatch(/OTHER device/);
  });

  it("step 2 before step 1 says to run step 1 first", async () => {
    const a = await dev({ name: "phone" });
    const b = await dev({ name: "tablet", type: "tablet" });
    await a.vault.setup(PASS);
    await a.sync.syncNow("all"); await b.sync.syncNow("all"); await b.vault.unlock(PASS);
    const r = await p2(b);
    expect(r.pass).toBe(false);
    expect(r.text).toMatch(/Run Drill step 1/);
  });

  it("fails clearly, not silently, if the other device re-keyed in between and this one has not caught up", async () => {
    const a = await dev({ name: "phone" });
    const b = await dev({ name: "tablet", type: "tablet" });
    await a.vault.setup(PASS);
    await p1(a);
    await b.sync.syncNow("all"); await b.vault.unlock(PASS);
    await a.rekey.rekey({ passphrase: PASS }); // the Sheet now holds the new key; b still holds the old one in memory
    const r = await p2(b);
    expect(r.pass).toBe(false);
    expect(r.text).toMatch(/could not decrypt/);
    await b.sync.syncNow("all");           // b catches up: locks, then the passphrase opens the new key
    await b.vault.unlock(PASS);
    expect((await p2(b)).pass).toBe(true);
  });
});

describe("photo test", () => {
  // jsdom's Blob has no arrayBuffer(); every real browser does, so the stand-in provides it
  const stubFile = (size = 3_100_000, type = "image/jpeg") => ({ name: "IMG_0001.jpg", size, type, arrayBuffer: async () => new ArrayBuffer(8) });
  const mkFiles = async (shrinkOut) => {
    const d = await dev({ name: "phone", shrink: async () => shrinkOut });
    await d.vault.setup(PASS);
    return d;
  };

  it("passes when the shrunk photo keeps its shape, is within 1600 px and ~300 KB, plain and encrypted, then deletes the test files", async () => {
    const d = await mkFiles({ bytes: new Uint8Array(280 * 1024).fill(7), mime: "image/jpeg" });
    const decode = async (b, opts) => (opts ? { width: 3024, height: 4032 } : { width: 1200, height: 1600 });
    const r = await runPhotoTest({ file: stubFile(), files: d.files, vault: d.vault, decode });
    expect(r.text).toMatch(/passed/);
    expect(r.text).toMatch(/plain 1200x1600, 280 KB/);
    expect(r.text).toMatch(/encrypted 1200x1600/);
    expect(await d.files.list("selftest")).toHaveLength(0);
    expect(r.text).toMatch(/Original 3024x4032, 3\.1 MB/);
  });

  it("fails if the result came out sideways (portrait became landscape)", async () => {
    const d = await mkFiles({ bytes: new Uint8Array(100 * 1024).fill(1), mime: "image/jpeg" });
    const decode = async (b, opts) => (opts ? { width: 3024, height: 4032 } : { width: 1600, height: 1200 });
    const r = await runPhotoTest({ file: stubFile(), files: d.files, vault: d.vault, decode });
    expect(r.pass).toBe(false);
    expect(r.text).toMatch(/turned sideways/);
    expect(await d.files.list("selftest")).toHaveLength(0); // cleaned up even on failure
  });

  it("fails if the photo is still far over the size aim, and reports unreadable photos plainly", async () => {
    const d = await mkFiles({ bytes: new Uint8Array(900 * 1024).fill(3), mime: "image/jpeg" });
    const decode = async (b, opts) => (opts ? { width: 4000, height: 3000 } : { width: 1600, height: 1200 });
    const big = await runPhotoTest({ file: stubFile(), files: d.files, vault: d.vault, decode });
    expect(big.pass).toBe(false); expect(big.text).toMatch(/300 KB aim/);
    const bad = await runPhotoTest({ file: stubFile(1000, "image/heic"), files: d.files, vault: d.vault, decode: async () => { throw new Error("nope"); } });
    expect(bad.pass).toBe(false); expect(bad.text).toMatch(/could not open that photo \(image\/heic\)/);
  });

  it("skips the encrypted half when the Vault is locked", async () => {
    const d = await mkFiles({ bytes: new Uint8Array(50 * 1024).fill(5), mime: "image/jpeg" });
    await d.vault.lock();
    const decode = async (b, opts) => ({ width: 1200, height: 800 });
    const r = await runPhotoTest({ file: stubFile(), files: d.files, vault: d.vault, decode });
    expect(r.pass).toBe(true);
    expect(r.text).toMatch(/encrypted skipped/);
  });
});
