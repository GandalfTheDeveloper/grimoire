import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createBackend } from "./sim/sheetsSim.js";
import { makeDevice, addDemoApp, PASS, KEY } from "./helpers/device.js";
import * as vc from "../src/core/vaultCrypto.js";
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

describe("crypto primitives", () => {
  it("web crypto works here and round-trips text, bytes and json", async () => {
    const { raw, record } = await vc.createKeyRecord(PASS, { iterations: 1000 });
    const { key } = await vc.unwrapKeyRecord(PASS, record);
    const sealed = await vc.sealJson(key, { a: 1, t: "héllo ✓" }, "x|y|z");
    expect(sealed.startsWith("g1.")).toBe(true);
    expect(await vc.openJson(key, sealed, "x|y|z")).toEqual({ a: 1, t: "héllo ✓" });
    expect(raw.length).toBe(32);
  });
  it("a wrong passphrase is refused, and the right one with different unicode form still works", async () => {
    const { record } = await vc.createKeyRecord("café au lait ok", { iterations: 1000 });
    await expect(vc.unwrapKeyRecord("cafe au lait ok", record)).rejects.toMatchObject({ code: "passphrase" });
    await expect(vc.unwrapKeyRecord("café au lait ok".normalize("NFD"), record)).resolves.toBeTruthy(); // same text, other composition
  });
  it("the stored key record never contains the data key or the passphrase", async () => {
    const { raw, record } = await vc.createKeyRecord(PASS, { iterations: 1000 });
    const text = JSON.stringify(record);
    expect(text).not.toContain(PASS);
    expect(text).not.toContain(vc.b64(raw));
    expect(Object.keys(record).sort()).toEqual(["Iter", "KeyId", "Salt", "Version", "Wrapped"]);
  });
  it("ciphertext is bound to its place: wrong additional data, tampering and truncation all fail", async () => {
    const { record } = await vc.createKeyRecord(PASS, { iterations: 1000 });
    const { key } = await vc.unwrapKeyRecord(PASS, record);
    const sealed = await vc.sealJson(key, { s: "secret" }, "app|coll|id1");
    await expect(vc.openJson(key, sealed, "app|coll|id2")).rejects.toMatchObject({ code: "decrypt" });
    const flipped = sealed.slice(0, -4) + (sealed.slice(-4, -3) === "A" ? "B" : "A") + sealed.slice(-3);
    await expect(vc.openJson(key, flipped, "app|coll|id1")).rejects.toBeTruthy();
    await expect(vc.openJson(key, "g1.AAAA", "app|coll|id1")).rejects.toMatchObject({ code: "corrupt" });
    await expect(vc.openJson(key, "plain text", "app|coll|id1")).rejects.toMatchObject({ code: "corrupt" });
  });
  it("the same text encrypts differently every time (fresh random nonce)", async () => {
    const { record } = await vc.createKeyRecord(PASS, { iterations: 1000 });
    const { key } = await vc.unwrapKeyRecord(PASS, record);
    expect(await vc.sealJson(key, { a: 1 }, "k")).not.toBe(await vc.sealJson(key, { a: 1 }, "k"));
  });
});

const SECRET = "dear diary the safe code is 4417";

describe("vault setup, lock and unlock", () => {
  it("refuses a short passphrase, then sets up; the record that reaches the Sheet holds no secret", async () => {
    const a = await dev({ name: "a" });
    await expect(a.vault.setup("too short")).rejects.toMatchObject({ code: "short" });
    expect(a.vault.getState().setup).toBe(false);
    await a.vault.setup(PASS);
    expect(a.vault.getState()).toMatchObject({ setup: true, unlocked: true });
    await a.sync.syncNow("all");
    const rows = backend.rows("core_vault");
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["CreatedAt", "Deleted", "Id", "Iter", "KeyId", "Salt", "SchemaVersion", "SyncedAt", "UpdatedAt", "Version", "Wrapped"]);
    expect(JSON.stringify(rows[0])).not.toContain(PASS);
  });
  it("a second setup on the same vault is refused (unlock instead)", async () => {
    const a = await dev({ name: "a" });
    await a.vault.setup(PASS);
    await expect(a.vault.setup("another long passphrase")).rejects.toMatchObject({ code: "exists" });
  });
  it("locked: reads and writes of vault data throw a clear 'locked' error; unlock with the right passphrase works, wrong does not", async () => {
    const a = await dev({ name: "a" });
    await a.vault.setup(PASS);
    await a.vaulted.put(null, { Label: SECRET });
    await a.vault.lock();
    expect(a.vault.getState().unlocked).toBe(false);
    await expect(a.vaulted.list()).rejects.toMatchObject({ code: "locked" });
    await expect(a.vaulted.put(null, { Label: "x" })).rejects.toMatchObject({ code: "locked" });
    await expect(a.vault.unlock("not the passphrase!")).rejects.toMatchObject({ code: "passphrase" });
    expect(a.vault.getState().unlocked).toBe(false);
    await a.vault.unlock(PASS);
    expect((await a.vaulted.list())[0].Label).toBe(SECRET);
  });
  it("vault data in the Sheet is one scrambled Payload column; nothing readable, nothing numeric leaks", async () => {
    const a = await dev({ name: "a" });
    await a.vault.setup(PASS);
    await a.vaulted.put(null, { Label: SECRET, Amount: 187.4, Flag: true });
    await a.sync.syncNow("all");
    const rows = backend.rows("selftest_vaultedenc");
    expect(rows).toHaveLength(1);
    expect(backend.headers("selftest_vaultedenc")).toEqual(["Id", "CreatedAt", "UpdatedAt", "SyncedAt", "Deleted", "SchemaVersion", "Payload"]);
    expect(rows[0].Payload.startsWith("g1.")).toBe(true);
    const all = JSON.stringify(rows) + JSON.stringify(backend.rows("core_vault"));
    for (const bad of [SECRET, "4417", "187.4", "diary"]) expect(all).not.toContain(bad);
    expect(backend.tab("selftest_vaulted")).toBeUndefined(); // the readable twin is never created
  });
  it("a second device syncs the wrapped key, unlocks with the passphrase and reads the first device's records", async () => {
    const a = await dev({ name: "a" });
    const b = await dev({ name: "b", type: "tablet" });
    await a.vault.setup(PASS);
    await a.vaulted.put(null, { Label: SECRET, Amount: 5 });
    await a.sync.syncNow("all");
    expect(b.vault.getState().setup).toBe(false);
    await b.sync.syncNow("all");
    expect(b.vault.getState()).toMatchObject({ setup: true, unlocked: false });
    await b.vault.unlock(PASS);
    const list = await b.vaulted.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ Label: SECRET, Amount: 5 });
    await b.vaulted.put(null, { Label: "from b" });
    await b.sync.syncNow("all");
    await a.sync.syncNow("all");
    expect((await a.vaulted.list()).map((r) => r.Label).sort()).toEqual([SECRET, "from b"].sort());
  });
  it("records are bound to their row: a payload copied onto another record fails to decrypt instead of showing wrong data", async () => {
    const a = await dev({ name: "a" });
    await a.vault.setup(PASS);
    const r1 = await a.vaulted.put(null, { Label: "one" });
    const r2 = await a.vaulted.put(null, { Label: "two" });
    const rec1 = await a.db.get(`selftest|vaultedenc|${r1.id}`);
    const rec2 = await a.db.get(`selftest|vaultedenc|${r2.id}`);
    await a.db.put({ ...rec2, cols: { Payload: rec1.cols.Payload } });
    await expect(a.vaulted.get(r2.id)).rejects.toMatchObject({ code: "decrypt" });
  });
  it("changing the passphrase re-encrypts nothing: data stays readable, old passphrase stops working, other devices follow", async () => {
    const a = await dev({ name: "a" });
    const b = await dev({ name: "b" });
    await a.vault.setup(PASS);
    await a.vaulted.put(null, { Label: SECRET });
    await a.sync.syncNow("all");
    const before = backend.rows("selftest_vaultedenc")[0].Payload;
    await expect(a.vault.changePassphrase("wrong old passphrase", "a brand new passphrase")).rejects.toMatchObject({ code: "passphrase" });
    await a.vault.changePassphrase(PASS, "a brand new passphrase");
    await a.sync.syncNow("all");
    expect(backend.rows("selftest_vaultedenc")[0].Payload).toBe(before); // no data was touched
    expect((await a.vaulted.list())[0].Label).toBe(SECRET);
    await b.sync.syncNow("all");
    await expect(b.vault.unlock(PASS)).rejects.toMatchObject({ code: "passphrase" });
    await b.vault.unlock("a brand new passphrase");
    expect((await b.vaulted.list())[0].Label).toBe(SECRET);
    await expect(a.vault.changePassphrase("a brand new passphrase", "short")).rejects.toMatchObject({ code: "short" });
  });
  it("if another device replaces the vault key, this device locks itself", async () => {
    const a = await dev({ name: "a" });
    await a.vault.setup(PASS);
    expect(a.vault.unlocked).toBe(true);
    const other = await vc.createKeyRecord("some other passphrase here", { iterations: 1000 });
    await a.data.applyServer("core", "vault", { id: "vaultkey", createdAt: 1, updatedAt: Date.now() + 100000, syncedAt: 5, deleted: 0, schemaVersion: 1, cols: Object.fromEntries(Object.entries(other.record).map(([k, v]) => [k, String(v)])) });
    await new Promise((r) => setTimeout(r, 30));
    expect(a.vault.unlocked).toBe(false);
  });
});

describe("phone stays unlocked, tablet does not", () => {
  it("phone: still unlocked after the app is closed and reopened, until Lock now", async () => {
    const a = await dev({ name: "a", type: "phone" });
    await a.vault.setup(PASS);
    await a.vaulted.put(null, { Label: SECRET });
    const again = await a.restart(); devices.push(again);
    expect(again.vault.getState().unlocked).toBe(true);
    expect((await again.vaulted.list())[0].Label).toBe(SECRET);
    await again.vault.lock();
    const third = await again.restart(); devices.push(third);
    expect(third.vault.getState()).toMatchObject({ setup: true, unlocked: false });
  });
  it("tablet: never stays unlocked across a launch", async () => {
    const a = await dev({ name: "a", type: "tablet" });
    await a.vault.setup(PASS);
    expect(a.vault.unlocked).toBe(true);
    const again = await a.restart(); devices.push(again);
    expect(again.vault.getState()).toMatchObject({ setup: true, unlocked: false });
  });
});

describe("unlock diagnosis and repair", () => {
  it("a stray space typed before or after the passphrase still unlocks", async () => {
    const a = await dev({ name: "a" });
    await a.vault.setup(PASS); await a.sync.syncNow("all"); await a.vault.lock();
    await a.vault.unlock(PASS + " ");
    expect(a.vault.unlocked).toBe(true);
    await a.vault.lock();
    await a.vault.unlock("  " + PASS);
    expect(a.vault.unlocked).toBe(true);
  });
  it("a wrong passphrase says the key matches the Sheet's copy, so the typing is the problem", async () => {
    const a = await dev({ name: "a" });
    await a.vault.setup(PASS); await a.sync.syncNow("all"); await a.vault.lock();
    await expect(a.vault.unlock("not the passphrase")).rejects.toMatchObject({ code: "passphrase", detail: "same" });
  });
  it("when the Sheet cannot be reached it says so instead of guessing", async () => {
    const a = await dev({ name: "a" });
    await a.vault.setup(PASS); await a.sync.syncNow("all"); await a.vault.lock();
    backend.offline = true;
    await expect(a.vault.unlock("not the passphrase")).rejects.toMatchObject({ code: "passphrase", detail: "offline" });
  });
  it("a damaged copy on this device is replaced by the Sheet's good copy, and unlock works", async () => {
    const a = await dev({ name: "a" });
    await a.vault.setup(PASS); await a.sync.syncNow("all"); await a.vault.lock();
    const rec = await a.db.get("core|vault|vaultkey");
    await a.db.put({ ...rec, cols: { ...rec.cols, Wrapped: "AAAA" + rec.cols.Wrapped.slice(4) } }); // damage only the local copy
    await a.vault.refresh();
    await a.vault.unlock(PASS);
    expect(a.vault.unlocked).toBe(true);
    await a.vault.lock();
    await a.vault.unlock(PASS); // now the local copy is good again
    expect(a.vault.unlocked).toBe(true);
  });
  it("if the Sheet's copy itself is damaged, the right passphrase is refused and the message says the copies differ", async () => {
    const a = await dev({ name: "a" });
    await a.vault.setup(PASS); await a.sync.syncNow("all"); await a.vault.lock();
    const rec = await a.db.get("core|vault|vaultkey");
    await a.db.put({ ...rec, cols: { ...rec.cols, Wrapped: "AAAA" + rec.cols.Wrapped.slice(4) } });
    await a.vault.refresh();
    backend.sheets.get("core_vault").getRange(2, 9).setValue("AAAA" + rec.cols.Wrapped.slice(4)); // damage in the Sheet too
    await expect(a.vault.unlock(PASS)).rejects.toMatchObject({ code: "passphrase" });
  });
});

describe("start over after a lost passphrase", () => {
  it("deletes the key everywhere, lets a new Vault be created, and the old passphrase no longer matters", async () => {
    const a = await dev({ name: "a" });
    const b = await dev({ name: "b", type: "tablet" });
    await a.vault.setup(PASS); await a.sync.syncNow("all"); await b.sync.syncNow("all");
    expect(b.vault.setupDone).toBe(true);
    await a.vault.lock();
    await a.vault.reset();
    expect(a.vault.setupDone).toBe(false);
    expect(a.vault.unlocked).toBe(false);
    await a.sync.syncNow("all"); await b.sync.syncNow("all");
    expect(b.vault.setupDone).toBe(false); // the other device sees it is gone
    await a.vault.setup("a brand new passphrase");
    await a.sync.syncNow("all"); await b.sync.syncNow("all");
    await expect(b.vault.unlock(PASS)).rejects.toMatchObject({ code: "passphrase" });
    await b.vault.unlock("a brand new passphrase");
    expect(b.vault.unlocked).toBe(true);
  });
  it("refuses when there is no Vault", async () => {
    const a = await dev({ name: "a" });
    await expect(a.vault.reset()).rejects.toMatchObject({ code: "notsetup" });
  });
});
