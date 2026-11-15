import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createBackend } from "./sim/sheetsSim.js";
import { makeDevice, addDemoApp, PASS, KEY } from "./helpers/device.js";
import { getSyncStatus, setSyncStatus } from "../src/core/syncStatus.js";
import { b64 } from "../src/core/vaultCrypto.js";
import { FILE_MAX_BYTES, PART_BYTES } from "../src/core/files.js";

let backend, now;
const devices = [];
const dev = async (o) => { const d = makeDevice(backend, { clock: () => now, ...o }); devices.push(d); await d.boot(); return d; };
beforeEach(() => {
  now = 1_800_000_000_000;
  backend = createBackend({ key: KEY });
  addDemoApp(backend);
  setSyncStatus({ pending: 0, lastSync: null, errors: [], syncing: false, lastError: null, configured: false, backendVersion: null });
});
afterEach(() => { while (devices.length) devices.pop().sync.stop(); });

const enc = (s) => new TextEncoder().encode(s);
const driveParts = () => [...backend.drive.files.values()].filter((f) => !f.trashed && /\.\d+$/.test(f.name));
const driveText = () => driveParts().map((f) => Buffer.from(f.bytes).toString("latin1")).join("");
const same = (a, b) => Buffer.from(a).equals(Buffer.from(b));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("files in a readable app", () => {
  it("stores on the device first, uploads in the background, and lands in a per-app Drive folder", async () => {
    const a = await dev({ name: "a" });
    const bytes = enc("hello receipt ".repeat(50));
    backend.offline = true;
    const f = await a.files.put("demoapp", { name: "r.txt", mime: "text/plain", bytes });
    expect(a.files.pendingCount()).toBe(1);
    expect(getSyncStatus().pending).toBeGreaterThanOrEqual(1); // the dot is amber for a file waiting to upload
    expect((await a.files.get("demoapp", f.id)).bytes).toEqual(bytes); // readable straight away, from this device
    backend.offline = false;
    await a.sync.syncNow("all");
    await sleep(20);
    expect(a.files.pendingCount()).toBe(0);
    expect(getSyncStatus().pending).toBe(0);
    const parts = driveParts();
    expect(parts).toHaveLength(1);
    expect(parts[0].name).toBe(`${f.id}.0`);
    expect(parts[0].mime).toBe("text/plain");
    const folder = [...backend.drive.folders.values()].find((x) => x.name === "demoapp");
    expect(folder).toBeTruthy();
    expect(backend.rows("core_files")[0]).toMatchObject({ App: "demoapp", Name: "r.txt", Mime: "text/plain", Size: String(bytes.length), Parts: "1" });
  });
  it("another device downloads it, checks it against the saved fingerprint, and notices damage", async () => {
    const a = await dev({ name: "a" });
    const b = await dev({ name: "b", type: "tablet" });
    const bytes = new Uint8Array(3_200_000).map((_, i) => (i * 7) % 251);
    const f = await a.files.putAndWait("demoapp", { name: "big.bin", mime: "application/octet-stream", bytes });
    expect(f.parts).toBe(3);
    expect(driveParts()).toHaveLength(3);
    await a.sync.syncNow("all"); await b.sync.syncNow("all");
    const got = await b.files.get("demoapp", f.id);
    expect(same(got.bytes, bytes)).toBe(true);
    driveParts()[1].bytes[10] ^= 0xff; // damage one part in Drive
    await expect(b.files.get("demoapp", f.id)).rejects.toMatchObject({ code: "corrupt" });
  });
  it("a file that has not finished uploading from another device gives a plain message, not a crash", async () => {
    const a = await dev({ name: "a" });
    const b = await dev({ name: "b" });
    const f = await a.files.putAndWait("demoapp", { name: "x.txt", mime: "text/plain", bytes: enc("abc") });
    driveParts().forEach((p) => { p.trashed = true; });
    await a.sync.syncNow("all"); await b.sync.syncNow("all");
    await expect(b.files.get("demoapp", f.id)).rejects.toMatchObject({ code: "uploading" });
  });
  it("refuses files over 10 MB and stores nothing", async () => {
    const a = await dev({ name: "a" });
    await expect(a.files.put("demoapp", { name: "huge", bytes: new Uint8Array(FILE_MAX_BYTES + 1) })).rejects.toMatchObject({ code: "too_big" });
    expect(a.files.pendingCount()).toBe(0);
    expect(await a.files.list("demoapp")).toEqual([]);
    const ok = await a.files.put("demoapp", { name: "just fits", bytes: new Uint8Array(FILE_MAX_BYTES) });
    expect(ok.parts).toBe(Math.ceil(FILE_MAX_BYTES / PART_BYTES));
  });
  it("photos go through the shrinker first and are stored as the small JPEG", async () => {
    const small = new Uint8Array(1000).fill(7);
    let got = null;
    const a = await dev({ name: "a", shrink: async (blob) => { got = blob; return { bytes: small, mime: "image/jpeg" }; } });
    const original = new Uint8Array(4_000_000).fill(1);
    const f = await a.files.putAndWait("demoapp", { name: "IMG_1.heic", mime: "image/heic", bytes: original, photo: true });
    expect(got).toBeTruthy();
    expect(f).toMatchObject({ photo: true, mime: "image/jpeg", size: 1000 });
    expect(same((await a.files.get("demoapp", f.id)).bytes, small)).toBe(true);
    expect(driveParts()[0].bytes.length).toBe(1000);
  });
});

describe("30-day trash", () => {
  it("trashed files leave the normal list, can be restored, and are only removed after 30 days", async () => {
    const a = await dev({ name: "a" });
    const f = await a.files.putAndWait("demoapp", { name: "t.txt", mime: "text/plain", bytes: enc("temp") });
    await a.files.trash("demoapp", f.id);
    expect(await a.files.list("demoapp")).toHaveLength(0);
    expect((await a.files.list("demoapp", { trashed: true }))[0].id).toBe(f.id);
    await a.files.restore("demoapp", f.id);
    expect(await a.files.list("demoapp")).toHaveLength(1);
    await a.files.trash("demoapp", f.id);
    now += 29 * 86400000;
    expect(await a.files.purgeExpired()).toBe(0);
    expect(driveParts()).toHaveLength(1);
    now += 2 * 86400000; // 31 days after trashing
    expect(await a.files.purgeExpired()).toBe(1);
    expect(driveParts()).toHaveLength(0); // moved to the Drive bin, never hard-deleted by Grimoire
    expect([...backend.drive.files.values()].some((x) => x.name === `${f.id}.0` && x.trashed)).toBe(true);
    expect(await a.files.list("demoapp", { trashed: true })).toHaveLength(0);
    await a.sync.syncNow("all");
    expect(backend.rows("core_files")[0].Deleted).toBe(1);
  });
  it("the sync engine runs the purge by itself after a sync", async () => {
    const a = await dev({ name: "a" });
    const f = await a.files.putAndWait("demoapp", { name: "t.txt", mime: "text/plain", bytes: enc("temp") });
    await a.files.trash("demoapp", f.id);
    now += 31 * 86400000;
    await a.sync.syncNow("all");
    expect(driveParts()).toHaveLength(0);
  });
});

describe("files in a Vault app", () => {
  it("encrypts on the device: Drive holds scrambled parts, the Sheet record is one Payload, and the name is hidden", async () => {
    const a = await dev({ name: "a", defaults: { demoapp: true } });
    await a.vault.setup(PASS);
    const marker = "SECRET-STATEMENT-4417 ";
    const bytes = enc(marker.repeat(200_000)); // about 4.4 MB, several parts
    const f = await a.files.putAndWait("demoapp", { name: "chase-statement-oct.pdf", mime: "application/pdf", bytes });
    expect(f.enc).toBe(true);
    expect(driveParts().length).toBeGreaterThan(1);
    expect(driveText()).not.toContain("SECRET-STATEMENT");
    expect(driveParts().every((p) => p.mime === "application/octet-stream")).toBe(true);
    await a.sync.syncNow("all");
    expect(backend.rows("core_files")).toHaveLength(0);
    const rec = backend.rows("core_filesenc");
    expect(rec).toHaveLength(1);
    expect(backend.headers("core_filesenc")).toEqual(["Id", "CreatedAt", "UpdatedAt", "SyncedAt", "Deleted", "SchemaVersion", "Payload"]);
    expect(JSON.stringify(rec)).not.toContain("chase");
    expect(JSON.stringify(rec)).not.toContain("pdf");
    expect(same((await a.files.get("demoapp", f.id)).bytes, bytes)).toBe(true);
  });
  it("a second device unlocks the Vault and opens the file; locked, it cannot", async () => {
    const a = await dev({ name: "a", defaults: { demoapp: true } });
    const b = await dev({ name: "b", type: "tablet", defaults: { demoapp: true } });
    await a.vault.setup(PASS);
    const bytes = enc("private ".repeat(1000));
    const f = await a.files.putAndWait("demoapp", { name: "p.txt", mime: "text/plain", bytes });
    await a.sync.syncNow("all"); await b.sync.syncNow("all");
    await expect(b.files.list("demoapp")).rejects.toMatchObject({ code: "locked" });
    await b.vault.unlock(PASS);
    const list = await b.files.list("demoapp");
    expect(list[0]).toMatchObject({ name: "p.txt", mime: "text/plain", enc: true });
    expect(same((await b.files.get("demoapp", f.id)).bytes, bytes)).toBe(true);
  });
  it("locked or not set up: saving a file is refused up front", async () => {
    const a = await dev({ name: "a", defaults: { demoapp: true } });
    await expect(a.files.put("demoapp", { name: "x", bytes: enc("x") })).rejects.toMatchObject({ code: "notsetup" });
    await a.vault.setup(PASS); await a.vault.lock();
    await expect(a.files.put("demoapp", { name: "x", bytes: enc("x") })).rejects.toMatchObject({ code: "locked" });
  });
  it("one file's key cannot open another file (the key and bytes are bound to the file id)", async () => {
    const a = await dev({ name: "a", defaults: { demoapp: true } });
    await a.vault.setup(PASS);
    const f1 = await a.files.putAndWait("demoapp", { name: "1", bytes: enc("one one one") });
    const f2 = await a.files.putAndWait("demoapp", { name: "2", bytes: enc("two two two") });
    const p1 = driveParts().find((p) => p.name === `${f1.id}.0`);
    const p2 = driveParts().find((p) => p.name === `${f2.id}.0`);
    p2.bytes = p1.bytes.slice(); // swap in the other file's bytes
    await expect(a.files.get("demoapp", f2.id)).rejects.toMatchObject({ code: "corrupt" });
  });
});

describe("backend: files, backup, usage", () => {
  const post = (b) => backend.post({ key: KEY, ...b });
  const part = (bytes) => b64(new Uint8Array(bytes));
  it("only apps that declare files may use Drive; ids, part numbers and sizes are validated", () => {
    expect(post({ action: "fileput", app: "core", fileId: "abcdefgh1", index: 0, data: part([1]) })).toMatchObject({ ok: false, error: "files_not_allowed" });
    expect(post({ action: "fileput", app: "nope", fileId: "abcdefgh1", index: 0, data: part([1]) })).toMatchObject({ ok: false, error: "files_not_allowed" });
    expect(post({ action: "fileput", app: "demoapp", fileId: "../etc", index: 0, data: part([1]) })).toMatchObject({ ok: false, error: "bad_file_id" });
    expect(post({ action: "fileput", app: "demoapp", fileId: "abcdefgh1", index: 99, data: part([1]) })).toMatchObject({ ok: false, error: "bad_part" });
    expect(post({ action: "fileput", app: "demoapp", fileId: "abcdefgh1", index: 1.5, data: part([1]) })).toMatchObject({ ok: false, error: "bad_part" });
    expect(post({ action: "fileput", app: "demoapp", fileId: "abcdefgh1", index: 0 })).toMatchObject({ ok: false, error: "bad_request" });
    expect(post({ action: "fileput", app: "demoapp", fileId: "abcdefgh1", index: 0, data: part(new Array(2_000_001).fill(1)) })).toMatchObject({ ok: false, error: "part_too_big" });
    expect(post({ action: "fileget", app: "demoapp", fileId: "abcdefgh1", index: 0 })).toMatchObject({ ok: false, error: "not_found" });
    expect(backend.drive.root.subs.length).toBe(0 + backend.drive.root.subs.length); // nothing leaked into other places
  });
  it("a retried part replaces the earlier try, bytes round-trip exactly (including high bytes), and file ops need the key", () => {
    const bytes = [0, 1, 127, 128, 200, 255, 10, 13];
    expect(post({ action: "fileput", app: "demoapp", fileId: "abcdefgh1", index: 0, data: part([9, 9]) }).ok).toBe(true);
    expect(post({ action: "fileput", app: "demoapp", fileId: "abcdefgh1", index: 0, data: part(bytes) }).ok).toBe(true);
    expect(driveParts()).toHaveLength(1);
    const got = post({ action: "fileget", app: "demoapp", fileId: "abcdefgh1", index: 0 });
    expect([...Buffer.from(got.data, "base64")]).toEqual(bytes);
    expect(backend.post({ key: "x".repeat(48), action: "fileget", app: "demoapp", fileId: "abcdefgh1", index: 0 })).toMatchObject({ ok: false, error: "auth" });
    expect(post({ action: "filedelete", app: "demoapp", fileId: "abcdefgh1", parts: 1 })).toMatchObject({ ok: true, removed: 1 });
    expect(driveParts()).toHaveLength(0);
  });
  it("backup makes a dated copy, keeps the newest 8 and bins the rest", () => {
    for (let i = 0; i < 11; i++) expect(post({ action: "backup" }).ok).toBe(true);
    const all = [...backend.drive.files.values()].filter((f) => f.name.startsWith("Grimoire backup "));
    expect(all).toHaveLength(11);
    const live = all.filter((f) => !f.trashed);
    expect(live).toHaveLength(8);
    const newest = [...all].sort((a, b) => b.created - a.created).slice(0, 8);
    expect(live.map((f) => f.id).sort()).toEqual(newest.map((f) => f.id).sort());
    expect(live[0].name).toMatch(/^Grimoire backup \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(post({ action: "backup" }).kept).toBe(8);
  });
  it("the weekly trigger is installed once, even if the setup step is run again, and it makes a backup", () => {
    backend.run("grimInstallWeeklyBackup()"); backend.run("grimInstallWeeklyBackup()");
    expect(backend.triggers).toEqual([{ fn: "grimBackupTrigger", day: "SUNDAY", hour: 3 }]);
    backend.run("grimBackupTrigger()");
    expect([...backend.drive.files.values()].filter((f) => f.name.startsWith("Grimoire backup "))).toHaveLength(1);
  });
  it("the weekly backup skips quietly when the script is busy, instead of copying mid-write", () => {
    backend.lock.held = true;
    backend.run("grimBackupTrigger()");
    expect([...backend.drive.files.values()].filter((f) => f.name.startsWith("Grimoire backup "))).toHaveLength(0);
  });
  it("usage counts every cell of every tab and reports Drive storage", async () => {
    const a = await dev({ name: "a" });
    await a.items.put(null, { Label: "x" }); await a.sync.syncNow("all");
    const r = post({ action: "usage" });
    let expected = 0; for (const sh of backend.sheets.values()) expected += sh.getMaxRows() * sh.getMaxColumns();
    expect(r).toMatchObject({ ok: true, cells: expected, cellLimit: 10_000_000, driveUsed: 1000 });
    expect(expected).toBeGreaterThan(0);
  });
  it("warns at 80% of the cell limit and at 85% of Drive storage, and not before; checks at most daily", async () => {
    const a = await dev({ name: "a" });
    const ev = (cells, used) => a.usage.evaluate({ cells, cellLimit: 10_000_000, driveUsed: used, driveLimit: 100 }).warnings;
    expect(ev(7_999_999, 84)).toEqual([]);
    expect(ev(8_000_000, 0)[0]).toMatch(/80% full/);
    expect(ev(0, 85)[0]).toMatch(/85% full/);
    expect(ev(9_000_000, 90)).toHaveLength(2);
    backend.drive.used = 90; backend.drive.limit = 100;
    await a.usage.check();
    expect(a.usage.get().warnings[0]).toMatch(/90% full/);
    const n = a.calls.length;
    await a.usage.check(); // inside the day: no new request
    expect(a.calls.length).toBe(n);
    now += 86_400_001;
    await a.usage.check();
    expect(a.calls.length).toBe(n + 1);
    const again = await a.restart(); devices.push(again);
    await again.usage.restore();
    expect(again.usage.get().warnings[0]).toMatch(/90% full/); // remembered across a launch
  });
});
