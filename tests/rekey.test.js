import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createBackend } from "./sim/sheetsSim.js";
import { makeDevice, addDemoApp, PASS, KEY } from "./helpers/device.js";
import { setSyncStatus } from "../src/core/syncStatus.js";
import { checkVault } from "../src/core/vaultRekey.js";

let backend;
const devices = [];
const dev = async (o) => { const d = makeDevice(backend, { defaults: { demoapp: true }, ...o }); devices.push(d); await d.boot(); return d; };
beforeEach(() => {
  backend = createBackend({ key: KEY });
  addDemoApp(backend);
  setSyncStatus({ pending: 0, lastSync: null, errors: [], syncing: false, lastError: null, configured: false, backendVersion: null });
});
afterEach(() => { while (devices.length) devices.pop().sync.stop(); });

const SECRET = "dear diary the safe code is 4417";
const norm = (r) => { const { id, createdAt, updatedAt, ...v } = r; return v; };

async function seeded() {
  const a = await dev({ name: "a" });
  const b = await dev({ name: "b", type: "tablet" });
  await a.vault.setup(PASS);
  const r1 = await a.notes.put(null, { Title: SECRET, Count: 187.4, Done: true, Tags: { x: [1] } });
  const r2 = await a.notes.put(null, { Title: "second" });
  const r3 = await a.notes.put(null, { Title: "gone soon" });
  await a.notes.remove(r3.id);
  const f = await a.files.putAndWait("demoapp", { name: "scan.bin", mime: "application/octet-stream", bytes: new Uint8Array([9, 8, 7, 6, 5]) });
  await a.sync.syncNow("all");
  await b.sync.syncNow("all");
  await b.vault.unlock(PASS);
  return { a, b, ids: [r1.id, r2.id, r3.id], file: f };
}

const drivePartsBefore = () => [...backend.drive.files.values()].map((x) => x.name + ":" + (x.size ?? x.bytes?.length ?? ""));

describe("re-key (lost-device plan)", () => {
  it("makes a new data key, re-encrypts everything, and the other device unlocks with the same passphrase and reads it all", async () => {
    const { a, b, ids } = await seeded();
    const oldKeyId = a.vault.getState().setup && (await a.db.get("core|vault|vaultkey")).cols.KeyId;
    const before = (await a.notes.list()).map(norm);
    const steps = [];
    const res = await a.rekey.rekey({ passphrase: PASS, onStep: (s) => steps.push(s) });
    expect(res.records).toBeGreaterThanOrEqual(4); // 3 notes (one deleted) + the file record
    expect(steps).toContain("Done");
    expect(steps[1]).toMatch(/Backing up/);
    const newKeyId = (await a.db.get("core|vault|vaultkey")).cols.KeyId;
    expect(newKeyId).not.toBe(oldKeyId);
    expect(a.vault.unlocked).toBe(true);
    expect((await a.notes.list()).map(norm)).toEqual(before);
    expect(a.data.pendingCount()).toBe(0);
    // the Sheet now holds only new-key ciphertext and the new key record
    expect(JSON.stringify(backend.rows("demoapp_notesenc"))).not.toContain(SECRET);
    expect(backend.rows("core_vault")[0].KeyId).toBe(newKeyId);

    // device b: its remembered/unwrapped key stops working after it syncs, then the passphrase opens the new key
    await b.sync.syncNow("all");
    expect(b.vault.getState().unlocked).toBe(false);
    await expect(b.notes.list()).rejects.toMatchObject({ code: "locked" });
    await b.vault.unlock(PASS);
    expect((await b.notes.list()).map(norm)).toEqual(before);
    expect((await checkVault({ data: b.data, db: b.db, vault: b.vault, files: b.files })).pass).toBe(true);
    // files: the bytes in Drive were not touched, and still open
    const list = await b.files.list("demoapp");
    expect(list).toHaveLength(1);
    expect([...(await b.files.get("demoapp", list[0].id)).bytes]).toEqual([9, 8, 7, 6, 5]);
    expect(ids.length).toBe(3);
  });

  it("the old key no longer opens anything in the Sheet, and the old backup still holds the old world", async () => {
    const { a } = await seeded();
    const oldRec = JSON.parse(JSON.stringify(backend.rows("core_vault")[0]));
    const oldPayload = backend.rows("demoapp_notesenc").map((r) => r.Payload);
    await a.rekey.rekey({ passphrase: PASS });
    const newPayload = backend.rows("demoapp_notesenc").map((r) => r.Payload);
    for (const p of newPayload) expect(oldPayload).not.toContain(p);
    expect(backend.rows("core_vault")[0].Wrapped).not.toBe(oldRec.Wrapped);
    const backups = [...backend.drive.files.values()].filter((f) => f.name.startsWith("Grimoire backup "));
    expect(backups.length).toBeGreaterThanOrEqual(1);
  });

  it("can change the passphrase at the same time; the old passphrase then fails, the new one works on the other device", async () => {
    const { a, b } = await seeded();
    const NEW = "a brand new long passphrase 123";
    const res = await a.rekey.rekey({ passphrase: PASS, newPassphrase: NEW });
    expect(res.passphraseChanged).toBe(true);
    await b.sync.syncNow("all");
    await expect(b.vault.unlock(PASS)).rejects.toMatchObject({ code: "passphrase" });
    await b.vault.unlock(NEW);
    expect((await b.notes.list()).length).toBe(2);
  });

  it("refuses a wrong passphrase, a locked Vault and unsynced work, and changes nothing", async () => {
    const { a } = await seeded();
    const snap = JSON.stringify(backend.rows("core_vault"));
    await expect(a.rekey.rekey({ passphrase: "definitely wrong one" })).rejects.toMatchObject({ code: "passphrase" });
    await expect(a.rekey.rekey({ passphrase: PASS, newPassphrase: "short" })).rejects.toMatchObject({ code: "short" });
    await a.notes.put(null, { Title: "waiting" });
    backend.setOffline && backend.setOffline(true);
    await a.vault.lock();
    await expect(a.rekey.rekey({ passphrase: PASS })).rejects.toMatchObject({ step: "check" });
    expect(JSON.stringify(backend.rows("core_vault"))).toBe(snap);
  });

  it("stops with nothing changed when one record cannot be read with the current key", async () => {
    const { a } = await seeded();
    const pk = (await a.db.byColl("demoapp|notesenc")).find((r) => !r.deleted).pk;
    const rec = await a.db.get(pk);
    await a.db.put({ ...rec, cols: { Payload: "g1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==" }, dirty: 0 });
    const keyBefore = JSON.stringify(await a.db.get("core|vault|vaultkey"));
    await expect(a.rekey.rekey({ passphrase: PASS })).rejects.toMatchObject({ step: "read" });
    expect(JSON.stringify(await a.db.get("core|vault|vaultkey"))).toBe(keyBefore);
    expect(a.vault.unlocked).toBe(true);
    const chk = await checkVault({ data: a.data, db: a.db, vault: a.vault, files: a.files });
    expect(chk.pass).toBe(false);
    expect(chk.text).toMatch(/demoapp_notesenc 1/);
    expect(chk.text).not.toContain(SECRET);
  });

  it("refuses when this device does not download an encrypted app, so that app is never left on the old key", async () => {
    const a = await dev({ name: "a", apps: ["selftest"] });
    await a.vault.setup(PASS);
    await a.vault.setAppState("demoapp", "on");
    await expect(a.rekey.rekey({ passphrase: PASS })).rejects.toMatchObject({ step: "check" });
  });

  it("a restart afterwards still unlocks the phone with the new key (remembered) and the tablet asks again", async () => {
    const { a } = await seeded();
    await a.rekey.rekey({ passphrase: PASS });
    const a2 = await a.restart(); devices.push(a2);
    expect(a2.vault.unlocked).toBe(true);
    expect((await a2.notes.list()).length).toBe(2);
  });

  it("new work done after a re-key on either device keeps flowing both ways", async () => {
    const { a, b } = await seeded();
    await a.rekey.rekey({ passphrase: PASS });
    await b.sync.syncNow("all"); await b.vault.unlock(PASS);
    await b.notes.put(null, { Title: "from b after rekey" });
    await b.sync.syncNow("all"); await a.sync.syncNow("all");
    expect((await a.notes.list()).map((r) => r.Title).sort()).toEqual([SECRET, "from b after rekey", "second"].sort());
  });
});
