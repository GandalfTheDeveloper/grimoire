// Grimoire backend, Golden Ratio handler (backend 0.7.0).
// Two tabs: goldenratio_history (calculation history, kept forever) and goldenratio_settings (one row: the
// app's settings, so they match on every device; added in 0.7.0). The generic engine in Grim_Core.gs does
// everything (newest edit wins, only changes travel, deletes are flags, every column stored as plain text so
// Sheets cannot turn a typed "3/8" into a date). Nothing here interprets the app's fields.
function grimApp_goldenratio_() {
  return {
    tabs: ["history", "settings"],
    files: false,
  };
}
