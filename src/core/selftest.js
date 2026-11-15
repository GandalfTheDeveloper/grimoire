// Sync self-test: a fake-data collection that exercises the whole pipeline against the real Sheet.
// It is the only thing in Round 2 that writes to the Sheet. It lives in its own tab (selftest_items),
// holds only invented values, and "Clear test data" flags those records deleted.
// The tricky values are the ones Google Sheets is known to mangle (times, dates, leading zeros,
// formulas), so a pass means the protections work on the real Sheet, not just in the simulator.

import { getSyncStatus } from "./syncStatus.js";

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
