// Grimoire backend, Golden Ratio handler (backend 0.6.0).
// One tab: goldenratio_history (calculation history, kept forever). The generic engine in Grim_Core.gs does
// everything (newest edit wins, only changes travel, deletes are flags, every column stored as plain text so
// Sheets cannot turn a typed "3/8" into a date). Nothing here interprets the app's fields.
function grimApp_goldenratio_() {
  return {
    tabs: ["history"],
    files: false,
  };
}
