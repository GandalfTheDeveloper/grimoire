// Google limits (charter section 4): a spreadsheet holds 10 million cells, and the Drive has a storage quota.
// Warn at 80% of the cell limit and at 85% of Drive storage. Asks the backend at most once a day (or on demand).
const DAY = 86400000;
export const CELL_WARN = 0.8;
export const DRIVE_WARN = 0.85;

export function createUsage({ sync, db, now = () => Date.now() }) {
  let state = { checkedAt: 0, cells: 0, cellLimit: 0, driveUsed: 0, driveLimit: 0, cellPct: 0, drivePct: 0, warnings: [] };
  const listeners = new Set();
  const emit = () => listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });

  function evaluate(r) {
    const warnings = [];
    const cellPct = r.cellLimit ? r.cells / r.cellLimit : 0;
    const drivePct = r.driveLimit ? r.driveUsed / r.driveLimit : 0;
    if (cellPct >= CELL_WARN) warnings.push(`The Sheet is ${Math.round(cellPct * 100)}% full (Google's limit is 10 million cells).`);
    if (drivePct >= DRIVE_WARN) warnings.push(`Your Google storage is ${Math.round(drivePct * 100)}% full.`);
    return { checkedAt: now(), cells: r.cells, cellLimit: r.cellLimit, driveUsed: r.driveUsed, driveLimit: r.driveLimit, cellPct, drivePct, warnings };
  }

  // Stamps the attempt before asking, so a backend that cannot answer (an older version) is not retried on every sync.
  async function check({ force = false } = {}) {
    const last = await db.getMeta("usage:checkedAt", 0);
    if (!force && now() - last < DAY) return state;
    await db.setMeta("usage:checkedAt", now());
    const r = await sync.call({ action: "usage" });
    state = evaluate(r);
    await db.setMeta("usage:last", state);
    emit();
    return state;
  }

  // After a launch, show the last known warning without waiting for the next check.
  async function restore() {
    const saved = await db.getMeta("usage:last", null);
    if (saved) { state = saved; emit(); }
  }

  return { check, restore, evaluate, get: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
}
