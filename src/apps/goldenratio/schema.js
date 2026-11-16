// One collection, "history" -> Sheet tab goldenratio_history (plus the standard Id, CreatedAt, UpdatedAt,
// SyncedAt, Deleted, SchemaVersion columns). Add fields later; never rename or remove (charter section 4).
//   Known      which field you typed in: a | b | whole
//   Typed      exactly what you typed (e.g. "3 5/8", "5' 3 1/2", "12.5"); stored as text so Sheets can't turn it into a date
//   AUnit, BUnit, WholeUnit   mm | cm | m | in | ft | ftin
//   AMm, BMm, WholeMm         the three lengths in millimetres at full precision
//   Tape       TRUE when tape-measure mode was on (results shown as fractions)
//   Source     the app the calculation was made in ("goldenratio" now; another app's id once it can open this as a pop-up)
export const HISTORY_FIELDS = {
  Known: "text", Typed: "text",
  AUnit: "text", BUnit: "text", WholeUnit: "text",
  AMm: "number", BMm: "number", WholeMm: "number",
  Tape: "bool", Source: "text",
};
// "settings" -> Sheet tab goldenratio_settings: ONE record (id below) so the same settings show on every device.
//   HideDemo   TRUE hides the "Try demo mode" button (leaving demo mode is always possible)
//   CopyUnit   TRUE copies "6.1803 mm"; FALSE copies "6.1803". Stored as "keep" / "drop" text, not a bool, so a
//              blank (record from before this column existed) means the default (with unit).
export const SETTINGS_FIELDS = { HideDemo: "bool", CopyUnit: "text" };
export const SETTINGS_ID = "goldenratio-settings";
export const COLLECTIONS = [{ name: "history", fields: HISTORY_FIELDS }, { name: "settings", fields: SETTINGS_FIELDS }];

export const toFields = (e) => ({
  Known: e.known, Typed: e.typed,
  AUnit: e.units.a, BUnit: e.units.b, WholeUnit: e.units.whole,
  AMm: e.mm.a, BMm: e.mm.b, WholeMm: e.mm.whole,
  Tape: !!e.tape, Source: e.source || "goldenratio",
});

export const fromRecord = (r) => ({
  id: r.id, createdAt: r.createdAt,
  known: r.Known, typed: r.Typed,
  units: { a: r.AUnit || "mm", b: r.BUnit || "mm", whole: r.WholeUnit || "mm" },
  mm: { a: r.AMm, b: r.BMm, whole: r.WholeMm },
  tape: !!r.Tape, source: r.Source || "goldenratio",
});

export const isValidEntry = (e) => e && ["a", "b", "whole"].includes(e.known) && ["a", "b", "whole"].every((k) => e.mm && e.mm[k] > 0);
