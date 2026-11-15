// Grimoire backend, part 3 of 3 (and the pattern for every app): one small handler file per app.
// It only declares which tabs the app may use. The generic code in Grim_Core.gs does the rest and
// never interprets app fields. Tab name = <app>_<collection>, for example selftest_items.

function grimApp_selftest_() {
  return {
    tabs: ["items"],
    readback: true, // lets the in-app sync test read its own fake rows back. Leave false for real apps.
  };
}
