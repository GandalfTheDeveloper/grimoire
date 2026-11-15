// Sync self-test: a fake-data collection that exercises the whole pipeline against the real Sheet.
// It is the only thing in Round 2 that writes to the Sheet. It lives in its own tab (selftest_items),
// holds only invented values, and "Clear test data" flags those records deleted.
// The tricky values are the ones Google Sheets is known to mangle (times, dates, leading zeros,
// formulas), so a pass means the protections work on the real Sheet, not just in the simulator.

import { getSyncStatus } from "./syncStatus.js";
import { sha256Hex } from "./vaultCrypto.js";
import { exportApp, importApp, parseExport } from "./vaultIO.js";

export const SELFTEST = { app: "selftest", name: "items" };

export const VAULT_TEST = { app: "selftest", name: "vaulted" };

export const selftestFields = { Label: "text", Clock: "text", Day: "text", Code: "text", Formula: "text", Amount: "number", Flag: "bool" };

export const TRICKY = [
  { Label: "times", Clock: "8:45", Day: "2026-11-15", Code: "007", Formula: "=1+1", Amount: 187.4, Flag: true },
  { Label: "duration", Clock: "32:15", Day: "2026-01-05", Code: "1e3", Formula: "+5", Amount: 0, Flag: false },
  { Label: "plain", Clock: "10:24", Day: "11/15/2026", Code: "0.50", Formula: "'quoted", Amount: -3.25, Flag: true },
];

export function defineSelftest(data) {
  return data.define({ ...SELFTEST, fields: selftestFields, onDemand: true });
}

// Writes the tricky records, syncs, asks the backend to read them back, compares.
// Returns { pass, checked, mismatches: ["times.Clock", ...] }. Never includes values.
export async function runSelfTest({ col, sync, data }) {
  const ids = [];
  for (const t of TRICKY) ids.push((await col.put(null, t)).id);
  await sync.syncNow("all");
  if (data.pendingCount() > 0) return { pass: false, checked: 0, mismatches: [getSyncStatus().lastError || "records still pending after sync"] };
  const back = await sync.call({ action: "readback", app: SELFTEST.app, coll: SELFTEST.name, ids });
  const mismatches = [];
  let checked = 0;
  TRICKY.forEach((t, i) => {
    const row = (back.records || []).find((r) => r.id === ids[i]);
    if (!row) { mismatches.push(`${t.Label}: missing in Sheet`); return; }
    const expected = {
      Label: t.Label, Clock: t.Clock, Day: t.Day, Code: t.Code, Formula: t.Formula,
      Amount: String(t.Amount), Flag: t.Flag ? "TRUE" : "FALSE",
    };
    for (const [k, v] of Object.entries(expected)) {
      checked += 1;
      if (String(row.cols[k]) !== v) mismatches.push(`${t.Label}.${k}`);
    }
  });
  return { pass: mismatches.length === 0, checked, mismatches };
}

export async function clearSelfTest({ col, sync }) {
  const all = await col.list();
  for (const r of all) await col.remove(r.id);
  await sync.syncNow("all");
  return all.length;
}

// ---- Vault self-test: proves, on the real Sheet, that vault data is scrambled and still reads back ----
const VAULT_SAMPLES = [
  { Label: "vault-test-one", Clock: "8:45", Code: "007", Formula: "=1+1", Amount: 187.4, Flag: true },
  { Label: "vault-test-two", Clock: "32:15", Code: "1e3", Formula: "'quoted", Amount: -3.25, Flag: false },
];
export async function runVaultTest({ col, sync, vault, data }) {
  if (!vault.unlocked) return { pass: false, text: "Unlock the Vault first (Settings, Vault)." };
  const ids = [];
  for (const t of VAULT_SAMPLES) ids.push((await col.put(null, t)).id);
  await sync.syncNow("all");
  if (data.pendingCount() > 0) return { pass: false, text: "Records are still waiting after sync, so the test could not finish." };
  const def = col.sides.enc.def;
  let since = 0; const remote = [];
  for (let i = 0; i < 20; i++) {
    const r = await sync.call({ action: "sync", items: [{ app: def.app, coll: def.name, fields: ["Payload"], since, pull: true, records: [] }] });
    const it = r.items[0];
    remote.push(...(it.records || []));
    if (!it.more) break;
    since = it.cursor;
  }
  const mine = ids.map((id) => remote.find((r) => r.id === id));
  if (mine.some((r) => !r)) return { pass: false, text: "Vault test FAILED: a record is missing from the Sheet" };
  const raw = JSON.stringify(mine);
  const leaked = ["vault-test", "187.4", "quoted", "32:15"].filter((w) => raw.includes(w));
  if (leaked.length) return { pass: false, text: `Vault test FAILED: readable text reached the Sheet (${leaked.length} item(s))` };
  const cols = Object.keys(mine[0].cols);
  if (cols.length !== 1 || cols[0] !== "Payload") return { pass: false, text: "Vault test FAILED: the Sheet row has columns other than Payload" };
  const bad = [];
  for (let i = 0; i < mine.length; i++) {
    const v = await def.codec.decode(mine[i].cols, def.fields, { app: def.app, coll: col.name, id: ids[i] });
    for (const [k, want] of Object.entries(VAULT_SAMPLES[i])) if (v[k] !== want) bad.push(`${VAULT_SAMPLES[i].Label}.${k}`);
  }
  if (bad.length) return { pass: false, text: `Vault test FAILED after decrypting: ${bad.join(", ")}` };
  return { pass: true, text: `Vault test passed: ${mine.length} records are scrambled in the Sheet (one Payload column) and decrypt back exactly.` };
}
export async function clearVaultTest({ col, sync }) {
  const all = await col.list();
  for (const r of all) await col.remove(r.id);
  await sync.syncNow("all");
  return all.length;
}

// ---- File self-test: a few MB of invented bytes through the real Drive, plain and (if unlocked) encrypted ----
export async function runFileTest({ files, vault }) {
  const out = [];
  const roundTrip = async (label, size, enc) => {
    const bytes = new Uint8Array(size);
    let x = 12345;
    for (let i = 0; i < size; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; bytes[i] = x >> 16; }
    const item = await files.putAndWait("selftest", { name: `${label}.bin`, mime: "application/octet-stream", bytes }, { enc });
    try {
      const got = await files.get("selftest", item.id);
      if (got.bytes.length !== bytes.length || got.bytes.some((b, i) => b !== bytes[i])) throw new Error(`${label}: the downloaded bytes differ`);
      await files.trash("selftest", item.id);
      await files.restore("selftest", item.id);
      out.push(`${label} ${(size / 1e6).toFixed(1)} MB in ${item.parts} part${item.parts > 1 ? "s" : ""}`);
    } finally {
      await files.deleteNow("selftest", item.id);
    }
  };
  await roundTrip("plain", 2_500_000, false);
  if (vault.unlocked) await roundTrip("encrypted", 1_600_000, true);
  else out.push("encrypted skipped (Vault is locked)");
  return { pass: true, text: `File test passed: ${out.join("; ")}. Uploaded, downloaded, checked, trashed, restored, deleted.` };
}

// ---- Recovery drill (charter section 5): lock, unlock on the OTHER device, export, import. Fake data only. ----
// Step 1 runs on one device, step 2 on the other. Nothing here touches a real app: the records live in the
// vault self-test collection and carry invented values. The drill reads from the SHEET, so it proves the
// other device can open what the first device saved using only the passphrase.
const DRILL_COUNT = 5;
const DRILL_MARKER = "drill-marker";
const drillRecord = (i) => ({ Label: `drill-${i}`, Clock: `${i}:${String(10 + i)}`, Code: String(i).padStart(3, "0"), Formula: i % 2 ? "=1+1" : "'quoted", Amount: i * 11.25, Flag: i % 2 === 1 });

async function fingerprint(list) {
  const rows = list.filter((r) => r.Label !== DRILL_MARKER).map((r) => [r.Label, r.Clock, r.Code, r.Formula, r.Amount, r.Flag]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return (await sha256Hex(new TextEncoder().encode(JSON.stringify(rows)))).slice(0, 16);
}

async function pullRemoteVaulted(sync, def) {
  let since = 0; const out = [];
  for (let i = 0; i < 20; i++) {
    const r = await sync.call({ action: "sync", items: [{ app: def.app, coll: def.name, fields: ["Payload"], since, pull: true, records: [] }] });
    const it = (r.items || [])[0] || {};
    out.push(...(it.records || []));
    if (!it.more) break;
    since = it.cursor;
  }
  return out.filter((r) => !r.deleted);
}

export async function prepareDrill({ col, sync, vault, data, deviceId }) {
  if (!vault.unlocked) return { pass: false, text: "Unlock the Vault first (Settings, The Vault)." };
  for (const r of await col.list()) await col.remove(r.id); // start clean
  const made = [];
  for (let i = 1; i <= DRILL_COUNT; i++) made.push(drillRecord(i));
  const fp = await fingerprint(made);
  for (const v of made) await col.put(null, v);
  await col.put(null, { Label: DRILL_MARKER, Clock: String(Date.now()), Code: fp, Formula: deviceId, Amount: DRILL_COUNT, Flag: false });
  await sync.syncNow("all");
  if (data.pendingCount() > 0) return { pass: false, text: "Drill step 1 could not finish: the records are still waiting to upload. Check your connection and try again." };
  return { pass: true, text: `Drill step 1 done: ${DRILL_COUNT} fake records are encrypted in your Sheet (fingerprint ${fp}). Now tap Lock now on this device, then open Grimoire on your OTHER device, unlock it with the passphrase, and run Drill step 2 there.` };
}

export async function checkDrill({ col, sync, vault, data, deviceId, collectionsFor }) {
  if (!vault.unlocked) return { pass: false, text: "Unlock the Vault first with the passphrase (Settings, The Vault). That is the point of the drill." };
  const def = col.sides.enc.def;
  const remote = await pullRemoteVaulted(sync, def);
  const rows = [];
  for (const r of remote) {
    try { rows.push({ id: r.id, v: await def.codec.decode(r.cols || {}, def.fields, { app: def.app, coll: col.name, id: r.id }) }); }
    catch { return { pass: false, text: "Drill step 2 FAILED: this device could not decrypt what the other device saved. The passphrase may differ from the one that created the Vault, or the Vault was re-keyed; tap Sync now and try again." }; }
  }
  const marker = rows.find((r) => r.v.Label === DRILL_MARKER);
  if (!marker) return { pass: false, text: "Drill step 2: no drill found in the Sheet. Run Drill step 1 on your other device first." };
  if (marker.v.Formula === deviceId) return { pass: false, text: "Drill step 2 has to run on your OTHER device (this one prepared the drill). Lock this device and use the other one." };
  const got = rows.filter((r) => r.v.Label !== DRILL_MARKER).map((r) => r.v);
  const fp = await fingerprint(got);
  if (got.length !== marker.v.Amount || fp !== marker.v.Code) return { pass: false, text: `Drill step 2 FAILED: the other device saved ${marker.v.Amount} records but this device read ${got.length}, or their contents differ. Tap Sync now and try again.` };

  // export -> lose the local copy -> import: the recovery path itself
  for (const r of rows) await col.sides.enc.importAll([{ id: r.id, createdAt: Date.now(), updatedAt: Date.now(), deleted: 0, values: r.v }]);
  const text = JSON.stringify(await exportApp("selftest", collectionsFor));
  const parsed = parseExport(text);
  const exportedHere = (parsed.collections[col.name] || []).filter((x) => !x.deleted).length;
  if (exportedHere < got.length + 1) return { pass: false, text: `Drill step 2 FAILED at export: only ${exportedHere} of ${got.length + 1} records were exported.` };
  await col.sides.enc.purgeLocal();
  const summary = await importApp("selftest", parsed, collectionsFor);
  const again = (await col.list()).filter((r) => r.Label !== DRILL_MARKER).map(({ id, createdAt, updatedAt, ...v }) => v);
  const fp2 = await fingerprint(again);
  if (again.length !== got.length || fp2 !== fp) return { pass: false, text: `Drill step 2 FAILED at import: ${again.length} of ${got.length} records came back intact.` };

  for (const r of await col.list()) await col.remove(r.id); // tidy up, and tell the Sheet
  await sync.syncNow("all");
  const left = (await pullRemoteVaulted(sync, def)).length;
  return { pass: true, text: `Recovery drill passed: this device unlocked with the passphrase and read all ${got.length} records the other device saved (fingerprint ${fp} matches), exported them (${exportedHere} incl. marker), lost its local copy, imported, and got all ${again.length} back intact. ${summary.imported} written on import; drill records cleaned up${left ? ` (${left} left in the Sheet; run Clear vault test data)` : ""}. On the first device, tap Clear vault test data.` };
}

// ---- Photo test: runs the real photo path on THIS device with a photo you pick. Reports numbers only. ----
const bitmapSize = async (blob, opts) => {
  const b = await createImageBitmap(blob, opts);
  const r = { width: b.width, height: b.height };
  if (b.close) b.close();
  return r;
};

export async function runPhotoTest({ file, files, vault, decode = bitmapSize, now = () => Date.now() }) {
  if (!file) return { pass: false, text: "Choose a photo first." };
  const out = [];
  let orig;
  try { orig = await decode(file, { imageOrientation: "from-image" }); }
  catch { return { pass: false, text: `Photo test FAILED: this browser could not open that photo (${file.type || "unknown type"}). Try a different photo, and tell me the type shown here.` }; }
  const ratio = orig.width / orig.height;
  const oneWay = async (label, enc) => {
    const t0 = now();
    const item = await files.putAndWait("selftest", { file, name: file.name || "photo.jpg", photo: true }, { enc });
    const secs = ((now() - t0) / 1000).toFixed(1);
    try {
      const got = await files.get("selftest", item.id);
      const dims = await decode(new Blob([got.bytes], { type: item.mime }));
      const r2 = dims.width / dims.height;
      if (Math.abs(r2 - ratio) / ratio > 0.02) throw new Error(`${label}: the shape changed (${orig.width}x${orig.height} became ${dims.width}x${dims.height}, so it may have turned sideways)`);
      if (Math.max(dims.width, dims.height) > 1600) throw new Error(`${label}: still bigger than 1600 px on the long side`);
      if (got.bytes.length > 400 * 1024) throw new Error(`${label}: ${Math.round(got.bytes.length / 1024)} KB is over the 300 KB aim (limit for this test 400 KB)`);
      out.push(`${label} ${dims.width}x${dims.height}, ${Math.round(got.bytes.length / 1024)} KB, ${secs} s up and checked`);
    } finally { await files.deleteNow("selftest", item.id); }
  };
  try {
    await oneWay("plain", false);
    if (vault.unlocked) await oneWay("encrypted", true); else out.push("encrypted skipped (Vault is locked)");
  } catch (e) { return { pass: false, text: `Photo test FAILED: ${e.message}` }; }
  return { pass: true, text: `Photo test passed. Original ${orig.width}x${orig.height}, ${(file.size / 1e6).toFixed(1)} MB. ${out.join("; ")}. Test files deleted.` };
}
