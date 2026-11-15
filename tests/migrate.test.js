import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createBackend } from "./sim/sheetsSim.js";
import { makeDevice, addDemoApp, PASS, KEY } from "./helpers/device.js";
import { exportApp, importApp, parseExport } from "../src/core/vaultIO.js";
import { setSyncStatus } from "../src/core/syncStatus.js";

let backend;
const devices = [];
const dev = async (o) => { const d = makeDevice(backend, o); devices.push(d); await d.boot(); return d; };
beforeEach(() => {
  backend = createBackend({ key: KEY });
  addDemoApp(backend);
  setSyncStatus({ pending: 0, lastSync: null, errors: [], syncing: false, lastError: null, configured: false, backendVersion: null });
});
afterEach(() => { while (devices.length) devices.pop().sync.stop(); });

const TRICKY = { Title: "=1+1", Body: "007 at 8:45 on 2026-11-15", Count: 187.4, Done: true, Tags: { x: [1, 2], y: "z" } };
const norm = (r) => { const { id, createdAt, updatedAt, ...v } = r; return v; };

async function seeded() {
  const a = await dev({ name: "a" });
  await a.vault.setup(PASS);
  const r1 = await a.notes.put(null, TRICKY);
  const r2 = await a.notes.put(null, { Title: "second", Body: "plain", Count: 0, Done: false, Tags: null });
  const r3 = await a.notes.put(null, { Title: "to delete" });
  await a.notes.remove(r3.id);
  await a.sync.syncNow("all");
  return { a, ids: [r1.id, r2.id, r3.id] };
}

describe("migrating an app into the Vault", () => {
  it("copies, verifies against the Sheet, switches over, keeps the old tab, and the data reads the same", async () => {
    const { a, ids } = await seeded();
    expect(backend.rows("demoapp_notes")).toHaveLength(3);
    const before = (await a.notes.list()).map(norm);
    const steps = [];
    const res = await a.migration.migrateApp({ app: "demoapp", direction: "in", onStep: (s) => steps.push(s) });
    expect(res.records).toBe(3);
    expect(steps[0]).toMatch(/Syncing/); expect(steps[1]).toMatch(/Backing up/); expect(steps).toContain("Done");
    expect(a.vault.appState("demoapp")).toBe("on");
    expect((await a.notes.list()).map(norm)).toEqual(before);
    // Sheet: the encrypted tab exists with all three records (one deleted), nothing readable in it
    const enc = backend.rows("demoapp_notesenc");
    expect(enc).toHaveLength(3);
    expect(enc.filter((r) => r.Deleted === 1)).toHaveLength(1);
    expect(JSON.stringify(enc)).not.toContain("007 at 8:45");
    expect(backend.headers("demoapp_notesenc")).toEqual(["Id", "CreatedAt", "UpdatedAt", "SyncedAt", "Deleted", "SchemaVersion", "Payload"]);
    // the old readable tab is NEVER erased by Grimoire
    expect(backend.rows("demoapp_notes")).toHaveLength(3);
    expect(res.oldTabs).toEqual(["demoapp_notes"]);
    // this device no longer holds the readable copy, and "Re-send everything" cannot resend it
    expect((await a.db.byColl("demoapp|notes")).length).toBe(0);
    await a.data.markAllDirty(); await a.sync.syncNow("all");
    expect(backend.rows("demoapp_notes")).toHaveLength(3);
    // a backup was taken first
    const backups = [];
    for (const f of backend.drive.files.values()) if (f.name.startsWith("Grimoire backup ")) backups.push(f);
    expect(backups).toHaveLength(1);
    expect(ids.length).toBe(3);
  });
  it("a second device follows: it sees the app is in the Vault and reads the encrypted data after unlocking", async () => {
    const { a } = await seeded();
    await a.migration.migrateApp({ app: "demoapp", direction: "in" });
    const b = await dev({ name: "b", type: "tablet" });
    await b.sync.syncNow("all");
    expect(b.vault.appState("demoapp")).toBe("on");
    await expect(b.notes.list()).rejects.toMatchObject({ code: "locked" });
    await b.vault.unlock(PASS);
    expect((await b.notes.list()).map(norm)).toEqual((await a.notes.list()).map(norm));
  });
  it("migrating back out restores readable data identically", async () => {
    const { a } = await seeded();
    const before = (await a.notes.list()).map(norm);
    await a.migration.migrateApp({ app: "demoapp", direction: "in" });
    const res = await a.migration.migrateApp({ app: "demoapp", direction: "out" });
    expect(a.vault.appState("demoapp")).toBe("off");
    expect((await a.notes.list()).map(norm)).toEqual(before);
    expect(res.oldTabs).toEqual(["demoapp_notesenc"]);
    expect(backend.rows("demoapp_notesenc")).toHaveLength(3); // still there until removed by hand
  });
  it("writes are blocked while a migration runs, and allowed again after", async () => {
    const { a } = await seeded();
    let blocked = null;
    const p = a.migration.migrateApp({ app: "demoapp", direction: "in", onStep: (s) => { if (/Encrypting/.test(s) && !blocked) blocked = a.notes.put(null, { Title: "mid" }).then(() => "allowed", (e) => e.code); } });
    await p;
    expect(await blocked).toBe("busy");
    await a.notes.put(null, { Title: "after" });
    expect((await a.notes.list()).some((r) => r.Title === "after")).toBe(true);
  });
  it("if the backup fails nothing is changed at all", async () => {
    const { a } = await seeded();
    backend.run(`DriveApp.getFileById = function () { throw new Error("no drive permission"); };`);
    await expect(a.migration.migrateApp({ app: "demoapp", direction: "in" })).rejects.toMatchObject({ step: "backup" });
    expect(a.vault.appState("demoapp")).toBe("off");
    expect(backend.tab("demoapp_notesenc")).toBeUndefined();
    expect((await a.notes.list()).length).toBe(2);
  });
  it("if the Sheet's copy does not match, the app goes back to its readable data and the user is told", async () => {
    const { a } = await seeded();
    backend.beforeRespond = async (body, result) => {
      const it = body.items && body.items[0];
      if (it && it.coll === "notesenc" && it.records.length === 0 && it.since === 0 && result.items[0].records) {
        // damage one record as the Sheet hands it back (simulates a bad write or a bad read)
        for (const rec of result.items[0].records) if (!rec.deleted) rec.cols = { Payload: "g1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==" };
      }
    };
    await expect(a.migration.migrateApp({ app: "demoapp", direction: "in" })).rejects.toMatchObject({ step: "verify" });
    backend.beforeRespond = null;
    expect(a.vault.appState("demoapp")).toBe("off");
    expect((await a.notes.list()).map(norm)).toContainEqual(TRICKY);
    // and a retry afterwards works
    await a.migration.migrateApp({ app: "demoapp", direction: "in" });
    expect(a.vault.appState("demoapp")).toBe("on");
  });
  it("refuses when locked, not set up, already migrated, or when edits are still waiting", async () => {
    const a = await dev({ name: "a" });
    await expect(a.migration.migrateApp({ app: "demoapp", direction: "in" })).rejects.toThrow(/Set up the Vault/);
    await a.vault.setup(PASS);
    await a.vault.lock();
    await expect(a.migration.migrateApp({ app: "demoapp", direction: "in" })).rejects.toThrow(/Unlock/);
    await a.vault.unlock(PASS);
    await expect(a.migration.migrateApp({ app: "demoapp", direction: "out" })).rejects.toThrow(/not in the Vault/);
    await a.notes.put(null, { Title: "x" });
    backend.offline = true;
    await expect(a.migration.migrateApp({ app: "demoapp", direction: "in" })).rejects.toThrow(/waiting on this device/);
    expect(a.vault.appState("demoapp")).toBe("off");
  });
  it("existing files are re-encrypted too: bytes in Drive become unreadable, the app still opens them", async () => {
    const a = await dev({ name: "a" });
    await a.vault.setup(PASS);
    const marker = new TextEncoder().encode("PLAINTEXT-RECEIPT-4417 ".repeat(40));
    const f = await a.files.putAndWait("demoapp", { name: "receipt.txt", mime: "text/plain", bytes: marker });
    const driveBytes = () => [...backend.drive.files.values()].filter((x) => !x.trashed && /\.\d+$/.test(x.name)).map((x) => Buffer.from(x.bytes).toString("latin1")).join("");
    expect(driveBytes()).toContain("PLAINTEXT-RECEIPT-4417");
    const res = await a.migration.migrateApp({ app: "demoapp", direction: "in" });
    expect(res.files).toBe(1);
    expect(driveBytes()).not.toContain("PLAINTEXT-RECEIPT-4417"); // old part is in the bin, new one is scrambled
    const list = await a.files.list("demoapp");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "receipt.txt", enc: true });
    expect(Buffer.from((await a.files.get("demoapp", list[0].id)).bytes).equals(Buffer.from(marker))).toBe(true);
    expect(list[0].id).not.toBe(f.id);
  });
});

describe("import and export", () => {
  it("exports decrypted records, imports them on another device, and importing twice changes nothing", async () => {
    const { a } = await seeded();
    await a.migration.migrateApp({ app: "demoapp", direction: "in" });
    const text = JSON.stringify(await exportApp("demoapp", a.collectionsFor));
    expect(text).toContain("007 at 8:45"); // an export is plain text on purpose: the user holds it
    const b = await dev({ name: "b" });
    await b.vault.setup("a different passphrase 12"); // separate vault, separate Sheet user
    await b.vault.setAppState("demoapp", "on");
    const s1 = await importApp("demoapp", parseExport(text), b.collectionsFor);
    expect(s1.imported).toBe(3);
    const s2 = await importApp("demoapp", parseExport(text), b.collectionsFor);
    expect(s2).toMatchObject({ imported: 0, skipped: 3 });
    expect((await b.notes.list()).map(norm)).toEqual((await a.notes.list()).map(norm));
  });
  it("an older export never overwrites newer edits", async () => {
    const a = await dev({ name: "a" });
    await a.vault.setup(PASS);
    const r = await a.notes.put(null, { Title: "v1" });
    const old = await exportApp("demoapp", a.collectionsFor);
    await a.notes.put(r.id, { Title: "v2" });
    const s = await importApp("demoapp", old, a.collectionsFor);
    expect(s.imported).toBe(0);
    expect((await a.notes.get(r.id)).Title).toBe("v2");
  });
  it("rejects things that are not exports, wrong apps and damaged records, importing nothing", async () => {
    const a = await dev({ name: "a" });
    expect(() => parseExport("hello")).toThrow(/not an export/);
    expect(() => parseExport(JSON.stringify({ format: "other" }))).toThrow(/not a Grimoire export/);
    const good = { format: "grimoire-export", v: 1, app: "demoapp", collections: { notes: [{ id: "abcdefgh1", createdAt: 1, updatedAt: 2, deleted: 0, values: { Title: "ok" } }, { id: "!!", createdAt: 1, updatedAt: 2, values: {} }] } };
    await expect(importApp("demoapp", parseExport(JSON.stringify(good)), a.collectionsFor)).rejects.toThrow(/damaged/);
    expect(await a.notes.list()).toHaveLength(0);
    await expect(importApp("lists", parseExport(JSON.stringify(good)), a.collectionsFor)).rejects.toThrow(/not "lists"/);
    const unknown = { ...good, collections: { nope: [] } };
    expect((await importApp("demoapp", unknown, a.collectionsFor)).unknown).toEqual(["nope"]);
  });
  it("an encrypted app cannot be exported while the Vault is locked", async () => {
    const { a } = await seeded();
    await a.migration.migrateApp({ app: "demoapp", direction: "in" });
    await a.vault.lock();
    await expect(exportApp("demoapp", a.collectionsFor)).rejects.toMatchObject({ code: "locked" });
  });
});
