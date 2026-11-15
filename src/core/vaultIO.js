// Import / export for apps (charter section 5): copy everything out as text, or paste/upload it back in.
// Works while the Vault is unlocked (an encrypted app's records are decrypted for export and encrypted again
// on import). Ids and timestamps travel with the data, so importing the same export twice changes nothing,
// and an older export never overwrites newer edits.
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const FORMAT = "grimoire-export";

export async function exportApp(app, collectionsFor, now = () => Date.now()) {
  const collections = {};
  for (const h of collectionsFor(app)) collections[h.name] = await h.exportAll();
  return { format: FORMAT, v: 1, app, exportedAt: now(), collections };
}

export function parseExport(text) {
  let obj;
  try { obj = JSON.parse(String(text)); } catch { throw new Error("That is not an export (it could not be read as text)"); }
  if (!obj || obj.format !== FORMAT || obj.v !== 1 || typeof obj.collections !== "object" || obj.collections === null) throw new Error("That is not a Grimoire export");
  return obj;
}

export async function importApp(app, obj, collectionsFor) {
  if (obj.app !== app) throw new Error(`That export is from "${obj.app}", not "${app}"`);
  const byName = new Map(collectionsFor(app).map((h) => [h.name, h]));
  const summary = { imported: 0, skipped: 0, unknown: [] };
  for (const [name, list] of Object.entries(obj.collections)) {
    const h = byName.get(name);
    if (!h) { summary.unknown.push(name); continue; }
    if (!Array.isArray(list)) throw new Error(`Collection "${name}" is damaged`);
    const clean = [];
    for (const r of list) {
      const ok = r && ID_RE.test(String(r.id)) && Number.isFinite(r.createdAt) && Number.isFinite(r.updatedAt) && (r.deleted ? true : r.values && typeof r.values === "object");
      if (!ok) throw new Error(`A record in "${name}" is damaged, so nothing was imported`);
      clean.push({ id: String(r.id), createdAt: r.createdAt, updatedAt: r.updatedAt, deleted: r.deleted ? 1 : 0, values: r.values || null });
    }
    const n = await h.importAll(clean);
    summary.imported += n;
    summary.skipped += clean.length - n;
  }
  return summary;
}
