// @vitest-environment node
// Runs the real Apps Script files against the simulated Sheets environment.
import { describe, it, expect, beforeEach } from "vitest";
import { createBackend } from "./sim/sheetsSim.js";

const KEY = "K".repeat(48);
let b;
beforeEach(() => { b = createBackend({ key: KEY }); });

const FIELDS = ["Label", "Clock"];
const rec = (id, updatedAt, cols = {}, extra = {}) => ({ id, createdAt: 10, updatedAt, deleted: 0, schemaVersion: 1, cols: { Label: "x", Clock: "", ...cols }, ...extra });
const item = (records = [], since = 0, extra = {}) => ({ app: "selftest", coll: "items", fields: FIELDS, since, pull: true, records, ...extra });
const sync = (items, extra = {}) => b.post({ key: KEY, action: "sync", items: Array.isArray(items) ? items : [items], ...extra });
const first = (r) => r.items[0];

describe("access", () => {
  it("answers GET with only the version", () => {
    const out = JSON.parse(b.run("doGet")({}).getContent());
    expect(out).toEqual({ ok: true, app: "grimoire", version: "0.4.0" });
  });
  it("rejects a wrong key and a missing key, and never touches the Sheet", () => {
    expect(b.post({ key: "nope", action: "ping" }).error).toBe("auth");
    expect(b.post({ action: "ping" }).error).toBe("auth");
    expect(b.post({ key: KEY + "x", action: "ping" }).error).toBe("auth");
    expect(b.sheets.size).toBe(0);
  });
  it("says not_configured when the Script Property is missing or too short", () => {
    delete b.props.GRIMOIRE_KEY;
    expect(b.post({ key: "anything", action: "ping" }).error).toBe("not_configured");
    b.props.GRIMOIRE_KEY = "short";
    expect(b.post({ key: "short", action: "ping" }).error).toBe("not_configured");
  });
  it("rejects malformed bodies and unknown actions", () => {
    expect(b.post("{not json").error).toBe("bad_request");
    expect(b.post({ key: KEY, action: "dropEverything" }).error).toBe("bad_request");
    expect(b.post({ key: KEY, action: "sync" }).error).toBe("bad_request");
  });
  it("ping works and reports the version", () => {
    const r = b.post({ key: KEY, action: "ping" });
    expect(r.ok).toBe(true);
    expect(r.version).toBe("0.4.0");
  });
});

describe("creating tabs and writing records", () => {
  it("creates the tab with envelope columns first, then fields, as plain text where it matters", () => {
    sync(item([rec("aaaaaaaa1", 100, { Label: "hi" })]));
    expect(b.headers("selftest_items")).toEqual(["Id", "CreatedAt", "UpdatedAt", "SyncedAt", "Deleted", "SchemaVersion", "Label", "Clock"]);
    const sh = b.tab("selftest_items");
    expect(sh.formats.get("5,1")).toBe("@"); // Id
    expect(sh.formats.get("5,7")).toBe("@"); // a field column
    expect(sh.formats.get("5,3")).toBe("0"); // UpdatedAt numeric
    expect(sh.frozen).toBe(1);
    const rows = b.rows("selftest_items");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ Id: "aaaaaaaa1", UpdatedAt: 100, Deleted: 0, SchemaVersion: 1, Label: "hi" });
  });
  it("adds new field columns later without moving or renaming anything", () => {
    sync(item([rec("aaaaaaaa1", 100)]));
    sync({ ...item([rec("aaaaaaaa2", 101, { Extra: "e" })]), fields: [...FIELDS, "Extra"] });
    expect(b.headers("selftest_items").slice(-3)).toEqual(["Label", "Clock", "Extra"]);
    expect(b.rows("selftest_items")[1].Extra).toBe("e");
    expect(b.rows("selftest_items")[0].Extra).toBe("");
  });
  it("only allows tabs an app handler declares", () => {
    expect(first(sync({ ...item([rec("aaaaaaaa1", 1)]), app: "journal" })).error).toBe("unknown_app");
    expect(first(sync({ ...item([rec("aaaaaaaa1", 1)]), coll: "secrets" })).error).toBe("unknown_collection");
    expect(first(sync({ ...item([rec("aaaaaaaa1", 1)]), app: "__proto__" })).error).toBe("unknown_app");
    expect(first(sync({ ...item([rec("aaaaaaaa1", 1)]), app: "constructor" })).error).toBe("unknown_app");
    expect(b.sheets.size).toBe(0);
  });
  it("refuses bad field names (header injection, envelope clashes)", () => {
    expect(first(sync({ ...item([rec("aaaaaaaa1", 1)]), fields: ["Id"] })).error).toBe("bad_field_name");
    expect(first(sync({ ...item([rec("aaaaaaaa1", 1)]), fields: ["a b"] })).error).toBe("bad_field_name");
    expect(first(sync({ ...item([rec("aaaaaaaa1", 1)]), fields: ["=IMPORTDATA(x)"] })).error).toBe("bad_field_name");
  });
  it("handles ids that look like object properties", () => {
    const r = first(sync(item([rec("constructor", 5), rec("toString00", 6)])));
    expect(r.acked).toEqual(["constructor", "toString00"]);
    expect(b.rows("selftest_items")).toHaveLength(2);
    // and is idempotent for them
    expect(first(sync(item([rec("constructor", 5)]))).acked).toEqual(["constructor"]);
    expect(b.rows("selftest_items")).toHaveLength(2);
  });
  it("rejects invalid records and oversize cells instead of cutting them short", () => {
    const big = "x".repeat(45001);
    const r = first(sync(item([rec("short", 1), rec("aaaaaaaa1", 1, { Label: big }), rec("aaaaaaaa2", 2)])));
    expect(r.acked).toEqual(["aaaaaaaa2"]);
    expect(r.rejected).toEqual(["short", "aaaaaaaa1"]);
    expect(b.rows("selftest_items")).toHaveLength(1);
  });
  it("accepts a cell right at the limit untouched", () => {
    const ok = "y".repeat(45000);
    sync(item([rec("aaaaaaaa1", 1, { Label: ok })]));
    expect(b.rows("selftest_items")[0].Label).toBe(ok);
  });
  it("refuses more than 200 records per collection per request", () => {
    const many = Array.from({ length: 201 }, (_, i) => rec(`id${String(i).padStart(8, "0")}`, i + 1));
    expect(first(sync(item(many))).error).toBe("too_many_records");
  });
  it("grows past the default 1000 rows", () => {
    for (let k = 0; k < 6; k++) {
      sync(item(Array.from({ length: 200 }, (_, i) => rec(`r${k}x${String(i).padStart(6, "0")}`, k * 200 + i + 1))));
    }
    expect(b.rows("selftest_items")).toHaveLength(1200);
    expect(b.tab("selftest_items").getMaxRows()).toBeGreaterThanOrEqual(1201);
  });
});

describe("date, time and number corruption", () => {
  const TRICKY = { Label: "t", Clock: "8:45" };
  it("sim self-check: a non-text cell really does convert values (so the tests below have teeth)", () => {
    const sh = b.ss.insertSheet("probe");
    sh.getRange(1, 1, 1, 5).setValues([["8:45", "32:15", "2026-11-15", "007", "=1+1"]]);
    const v = sh.getRange(1, 1, 1, 5).getValues()[0];
    expect(v[0]).toBeInstanceOf(Date);
    expect(v[1]).toBeInstanceOf(Date);
    expect(v[2]).toBeInstanceOf(Date);
    expect(v[3]).toBe(7);
    expect(v[4]).toBe(2);
  });
  it("keeps tricky text exactly as sent, because every field column is written as plain text", () => {
    const vals = { Clock: "8:45", Label: "2026-11-15" };
    sync(item([rec("aaaaaaaa1", 1, vals), rec("aaaaaaaa2", 2, { Clock: "32:15", Label: "007" }), rec("aaaaaaaa3", 3, { Clock: "=1+1", Label: "1e3" })]));
    const back = b.post({ key: KEY, action: "readback", app: "selftest", coll: "items", ids: ["aaaaaaaa1", "aaaaaaaa2", "aaaaaaaa3"] });
    const by = Object.fromEntries(back.records.map((r) => [r.id, r.cols]));
    expect(by.aaaaaaaa1).toMatchObject(vals);
    expect(by.aaaaaaaa2).toMatchObject({ Clock: "32:15", Label: "007" });
    expect(by.aaaaaaaa3).toMatchObject({ Clock: "=1+1", Label: "1e3" });
  });
  it("repairs a tab whose columns were NOT text (times, durations, dates, numbers) when reading", () => {
    sync(item([rec("aaaaaaaa1", 1)]));
    const sh = b.tab("selftest_items");
    sh.getRange(2, 7, 1, 2).setNumberFormat("General"); // simulate a column someone reformatted
    sh.getRange(2, 7, 1, 2).setValues([["2026-11-15", "8:45"]]);
    sh.getRange(3, 1, 1, 8).setNumberFormat("General");
    sh.getRange(3, 1, 1, 8).setValues([["aaaaaaaa2", 10, 2, 3, 0, 1, "32:15", "10:24"]]);
    const back = b.post({ key: KEY, action: "readback", app: "selftest", coll: "items", ids: ["aaaaaaaa1", "aaaaaaaa2"] });
    const by = Object.fromEntries(back.records.map((r) => [r.id, r.cols]));
    expect(by.aaaaaaaa1).toEqual({ Label: "2026-11-15", Clock: "8:45" });
    expect(by.aaaaaaaa2).toEqual({ Label: "32:15", Clock: "10:24" });
  });
  it("documents what cannot be repaired after the fact: a leading zero lost by conversion", () => {
    sync(item([rec("aaaaaaaa1", 1)]));
    const sh = b.tab("selftest_items");
    sh.getRange(2, 7, 1, 1).setNumberFormat("General");
    sh.getRange(2, 7, 1, 1).setValues([["007"]]);
    const back = b.post({ key: KEY, action: "readback", app: "selftest", coll: "items", ids: ["aaaaaaaa1"] });
    expect(back.records[0].cols.Label).toBe("7"); // this is why columns are written as text from the start
  });
  it("keeps text that starts with = or an apostrophe exactly as sent (real Sheets evaluates = and swallows ')", () => {
    const vals = ["=1+1", "'quoted", "''two", "=", "'", "+5", "-3", "@x", " =lead"];
    sync(item(vals.map((v, i) => rec(`aaaaaaaa${i}`, i + 1, { Label: v }))));
    const back = b.post({ key: KEY, action: "readback", app: "selftest", coll: "items", ids: vals.map((_, i) => `aaaaaaaa${i}`) });
    const got = vals.map((_, i) => back.records.find((r) => r.id === `aaaaaaaa${i}`).cols.Label);
    expect(got).toEqual(vals);
  });
  it("does not corrupt such values in columns an update did not mention", () => {
    sync({ ...item([rec("aaaaaaaa1", 1, { Label: "=1+1", Clock: "'k" })]), fields: FIELDS });
    sync({ ...item([rec("aaaaaaaa1", 2, { Label: "=1+1", Clock: "'k" })]), fields: FIELDS });
    // a later request that only knows about Label still rewrites the row; Clock must survive
    const r = { ...rec("aaaaaaaa1", 3, { Label: "=changed" }) };
    delete r.cols.Clock;
    sync({ ...item([r]), fields: ["Label"] });
    const back = b.post({ key: KEY, action: "readback", app: "selftest", coll: "items", ids: ["aaaaaaaa1"] });
    expect(back.records[0].cols).toEqual({ Label: "=changed", Clock: "'k" });
  });
  it("never escapes numeric envelope columns or ordinary text", () => {
    sync(item([rec("aaaaaaaa1", 5, { Label: "plain" })]));
    const row = b.rows("selftest_items")[0];
    expect(row).toMatchObject({ Id: "aaaaaaaa1", UpdatedAt: 5, Label: "plain" });
  });
  it("normalizes dates with and without a time of day", () => {
    const n = b.run("grimNormalize_");
    expect(n(new Date(Date.UTC(2026, 10, 15)), "UTC")).toBe("2026-11-15");
    expect(n(new Date(Date.UTC(2026, 10, 15, 13, 5, 9)), "UTC")).toBe("2026-11-15 13:05:09");
    expect(n(new Date(Date.UTC(1899, 11, 30, 0, 45)), "UTC")).toBe("0:45");
    expect(n(new Date(Date.UTC(1899, 11, 31, 8, 15)), "UTC")).toBe("32:15");
    expect(n(true, "UTC")).toBe("TRUE");
    expect(n(null, "UTC")).toBe("");
    expect(n(187.4, "UTC")).toBe("187.4");
  });
});

describe("newest wins, idempotent, changed rows only", () => {
  it("resending the same record changes nothing and writes nothing", () => {
    sync(item([rec("aaaaaaaa1", 100)]));
    const before = b.stats.setValuesCalls;
    const r = first(sync(item([rec("aaaaaaaa1", 100)])));
    expect(r.acked).toEqual(["aaaaaaaa1"]);
    expect(b.stats.setValuesCalls).toBe(before);
  });
  it("a newer edit replaces the row, keeps CreatedAt, and bumps SyncedAt", () => {
    sync(item([rec("aaaaaaaa1", 100, { Label: "one" })]));
    const s1 = b.rows("selftest_items")[0].SyncedAt;
    sync(item([rec("aaaaaaaa1", 200, { Label: "two" }, { createdAt: 99999 })]));
    const row = b.rows("selftest_items")[0];
    expect(row).toMatchObject({ Label: "two", UpdatedAt: 200, CreatedAt: 10 });
    expect(row.SyncedAt).toBeGreaterThan(s1);
    expect(b.rows("selftest_items")).toHaveLength(1);
  });
  it("an older edit loses and the Sheet's newer version comes back as 'stale'", () => {
    sync(item([rec("aaaaaaaa1", 200, { Label: "newer" })]));
    const r = first(sync(item([rec("aaaaaaaa1", 100, { Label: "older" })])));
    expect(r.acked).toEqual([]);
    expect(r.stale).toHaveLength(1);
    expect(r.stale[0]).toMatchObject({ id: "aaaaaaaa1", updatedAt: 200, cols: { Label: "newer" } });
    expect(b.rows("selftest_items")[0].Label).toBe("newer");
  });
  it("deletes are flags, not erased rows", () => {
    sync(item([rec("aaaaaaaa1", 100)]));
    sync(item([rec("aaaaaaaa1", 150, {}, { deleted: 1 })]));
    const rows = b.rows("selftest_items");
    expect(rows).toHaveLength(1);
    expect(rows[0].Deleted).toBe(1);
  });
  it("writes only the changed row, not the whole tab", () => {
    sync(item(Array.from({ length: 50 }, (_, i) => rec(`id${String(i).padStart(8, "0")}`, i + 1))));
    b.stats.rowsWritten = 0; b.stats.setValuesCalls = 0;
    sync(item([rec("id00000020", 9999, { Label: "changed" })]));
    expect(b.stats.rowsWritten).toBe(1);
    expect(b.stats.setValuesCalls).toBe(1);
  });
  it("neighbouring changed rows go out as one block", () => {
    sync(item(Array.from({ length: 20 }, (_, i) => rec(`id${String(i).padStart(8, "0")}`, i + 1))));
    b.stats.rowsWritten = 0; b.stats.setValuesCalls = 0;
    sync(item(["id00000005", "id00000006", "id00000007", "id00000015"].map((id) => rec(id, 5000, { Label: "z" }))));
    expect(b.stats.rowsWritten).toBe(4);
    expect(b.stats.setValuesCalls).toBe(2);
  });
  it("the same id twice in one request ends as one row with the newer content", () => {
    sync(item([rec("aaaaaaaa1", 100, { Label: "a" }), rec("aaaaaaaa1", 300, { Label: "c" })]));
    const rows = b.rows("selftest_items");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ Label: "c", UpdatedAt: 300 });
  });
});

describe("pulling only what changed (SyncedAt cursor)", () => {
  it("a new device gets everything, then nothing, then only what is new", () => {
    sync(item([rec("aaaaaaaa1", 1), rec("aaaaaaaa2", 2)]));
    const p1 = first(sync(item([], 0)));
    expect(p1.records.map((r) => r.id).sort()).toEqual(["aaaaaaaa1", "aaaaaaaa2"]);
    const p2 = first(sync(item([], p1.cursor)));
    expect(p2.records).toEqual([]);
    expect(p2.cursor).toBe(p1.cursor);
    sync(item([rec("aaaaaaaa3", 3)]));
    const p3 = first(sync(item([], p1.cursor)));
    expect(p3.records.map((r) => r.id)).toEqual(["aaaaaaaa3"]);
  });
  it("a request does not echo back what it just wrote, and its cursor moves past it", () => {
    sync(item([rec("aaaaaaaa1", 1)]));
    const r = first(sync(item([rec("aaaaaaaa2", 2)], 0)));
    expect(r.records.map((x) => x.id)).toEqual(["aaaaaaaa1"]);
    expect(r.cursor).toBe(r.batchTime);
  });
  it("a record with an OLD UpdatedAt that arrives late is still delivered (why SyncedAt exists)", () => {
    sync(item([rec("aaaaaaaa1", 5000)]));
    const tablet = first(sync(item([], 0)));
    // phone was offline; its edit was made long ago (UpdatedAt 10) and arrives only now
    sync(item([rec("aaaaaaaa9", 10)]));
    const next = first(sync(item([], tablet.cursor)));
    expect(next.records.map((r) => r.id)).toEqual(["aaaaaaaa9"]);
  });
  it("never creates a tab on a pull, and resets a cursor when no tab exists", () => {
    const r = first(sync(item([], 0)));
    expect(r.records).toEqual([]);
    expect(b.sheets.size).toBe(0);
    expect(first(sync(item([], 12345))).resetCursor).toBe(true);
  });
  it("tells a device to start over when its cursor is ahead of the Sheet (restored backup)", () => {
    sync(item([rec("aaaaaaaa1", 1)]));
    const r = first(sync(item([], 9e15)));
    expect(r.resetCursor).toBe(true);
    expect(r.cursor).toBe(0);
  });
  it("pages large pulls without splitting a batch that shares one SyncedAt", () => {
    for (let k = 0; k < 4; k++) sync(item(Array.from({ length: 200 }, (_, i) => rec(`k${k}x${String(i).padStart(6, "0")}`, k * 200 + i + 1))));
    // 4 batches of 200: pages must hold whole batches, so 600 (3 batches) then 200
    let cursor = 0, total = 0, pages = 0, more = true;
    while (more) {
      const r = first(sync(item([], cursor)));
      total += r.records.length; cursor = r.cursor; more = r.more; pages++;
      expect(r.records.length % 200).toBe(0);
    }
    expect(total).toBe(800);
    expect(pages).toBe(2);
  });
  it("pull:false and beacon requests write but never read", () => {
    sync(item([rec("aaaaaaaa1", 1)]));
    const r1 = first(sync(item([rec("aaaaaaaa2", 2)], 0, { pull: false })));
    expect(r1.records).toEqual([]);
    const r2 = first(sync(item([rec("aaaaaaaa3", 3)], 0), { beacon: true }));
    expect(r2.records).toEqual([]);
    expect(b.rows("selftest_items")).toHaveLength(3);
  });
});

describe("locking and failures", () => {
  it("answers busy when another write holds the lock", () => {
    b.lock.held = true;
    expect(sync(item([rec("aaaaaaaa1", 1)])).error).toBe("busy");
    expect(b.sheets.size).toBe(0);
  });
  it("releases the lock even if something throws mid-request", () => {
    sync(item([rec("aaaaaaaa1", 1)]));
    const sh = b.tab("selftest_items");
    const orig = sh.getRange.bind(sh);
    sh.getRange = () => { throw new Error("boom"); };
    const r = sync(item([rec("aaaaaaaa2", 2)]));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("server_error");
    expect(b.lock.held).toBe(false);
    sh.getRange = orig;
    expect(first(sync(item([rec("aaaaaaaa2", 2)]))).acked).toEqual(["aaaaaaaa2"]);
  });
  it("readback is limited to handlers that allow it", () => {
    expect(b.post({ key: KEY, action: "readback", app: "journal", coll: "entries", ids: [] }).error).toBe("bad_request");
  });
});
