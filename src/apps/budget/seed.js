// One-time seed file (charter section 5): Isaac's starting plan, income, accounts and rules, built outside
// the repo and imported here while the Vault is unlocked. The file is then deleted.
//
// Format: { "format": "thehoard-seed", "v": 1, "records": [ { "id", "type", "data" }, ... ] }
// Importing is safe to repeat: a record whose id is already on this device is left alone, so a second
// import never duplicates anything and never overwrites an edit made since.
import { TYPES } from "./schema.js";
import { CADENCES, isMonth } from "./plan.js";

export const SEED_FORMAT = "thehoard-seed";
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const num = (v) => typeof v === "number" && Number.isFinite(v);
const str = (v) => typeof v === "string";

function check(r) {
  const d = r.data;
  switch (r.type) {
    case "section": return str(d.name) && d.name.trim() && ["spend", "saving"].includes(d.kind);
    case "linev":
      return str(d.lineId) && str(d.name) && d.name.trim() && str(d.sectionId) && isMonth(d.effective) && num(d.amount) && CADENCES.includes(d.cadence)
        && (d.cadence !== "annual" || (Number.isInteger(d.month) && d.month >= 1 && d.month <= 12))
        && (d.cadence !== "onetime" || (str(d.date) && /^\d{4}-\d{2}-\d{2}$/.test(d.date)));
    case "income": return isMonth(d.effective) && num(d.grossYear) && num(d.checksPerYear) && d.checksPerYear > 0 && Array.isArray(d.lines) && d.lines.every((l) => str(l.name) && num(l.perCheck) && ["tax", "benefit"].includes(l.kind));
    case "account": return str(d.name) && d.name.trim() && str(d.kind);
    case "bal": return str(d.accountId) && isMonth(d.month) && num(d.amount);
    default: return true; // rule / goal: stored as given, read by later rounds
  }
}

// Throws a readable error, or returns { records, counts }.
export function parseSeed(text) {
  let obj;
  try { obj = JSON.parse(String(text)); } catch { throw new Error("That file could not be read. Pick the seed file (it ends in .json)."); }
  if (!obj || obj.format !== SEED_FORMAT || obj.v !== 1 || !Array.isArray(obj.records)) throw new Error("That is not a seed file for The Hoard.");
  const seen = new Set();
  const counts = {};
  obj.records.forEach((r, i) => {
    const where = `Record ${i + 1}`;
    if (!r || !ID_RE.test(String(r.id))) throw new Error(`${where} has a bad id, so nothing was imported.`);
    if (seen.has(r.id)) throw new Error(`${where} repeats the id ${r.id}, so nothing was imported.`);
    seen.add(r.id);
    if (!TYPES.includes(r.type) || !r.data || typeof r.data !== "object") throw new Error(`${where} has an unknown type, so nothing was imported.`);
    if (!check(r)) throw new Error(`${where} (${r.type}) is missing something it needs, so nothing was imported.`);
    counts[r.type] = (counts[r.type] || 0) + 1;
  });
  // every line and balance must point at something in the file or already on the device (checked at import)
  return { records: obj.records, counts };
}

// existingIds: ids already stored. put(id, type, data) writes one REAL record.
export async function importSeed(parsed, existingIds, put) {
  const have = new Set(existingIds);
  let added = 0, skipped = 0;
  for (const r of parsed.records) {
    if (have.has(r.id)) { skipped += 1; continue; }
    await put(r.id, r.type, r.data);
    have.add(r.id);
    added += 1;
  }
  return { added, skipped };
}

export const SEED_TYPE_TEXT = { section: "sections", linev: "plan line versions", income: "income versions", account: "accounts", bal: "balances", rule: "sorting rules (used from round B2)", goal: "goal inputs (used from round B3)" };
