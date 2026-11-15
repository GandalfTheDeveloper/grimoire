// Sync self-test: a fake-data collection that exercises the whole pipeline against the real Sheet.
// It is the only thing in Round 2 that writes to the Sheet. It lives in its own tab (selftest_items),
// holds only invented values, and "Clear test data" flags those records deleted.
// The tricky values are the ones Google Sheets is known to mangle (times, dates, leading zeros,
// formulas), so a pass means the protections work on the real Sheet, not just in the simulator.

import { getSyncStatus } from "./syncStatus.js";

export const SELFTEST = { app: "selftest", name: "items" };

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
