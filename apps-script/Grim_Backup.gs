// Grimoire backend: weekly Sheet backup, usage numbers, and the one-time permission/trigger helpers.
// The backup is a whole copy of the spreadsheet in the Drive folder "Grimoire Backups". The last 8 are kept
// (older ones go to the Drive bin). Files and photos are NOT copied: they are stored once in Grimoire Files.

const GRIM_BACKUP_KEEP = 8;
const GRIM_BACKUP_PREFIX = "Grimoire backup ";
const GRIM_CELL_LIMIT = 10000000; // Google Sheets: 10 million cells per spreadsheet

function grimBackupNow_() {
  const ss = grimSheet_();
  const folder = grimNamedFolder_("Grimoire Backups", "GRIMOIRE_BACKUP_FOLDER_ID");
  const stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm");
  const copy = DriveApp.getFileById(ss.getId()).makeCopy(GRIM_BACKUP_PREFIX + stamp, folder);
  const all = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf(GRIM_BACKUP_PREFIX) === 0) all.push({ f: f, t: f.getDateCreated().getTime() });
  }
  all.sort(function (a, b) { return b.t - a.t; });
  for (let i = GRIM_BACKUP_KEEP; i < all.length; i++) all[i].f.setTrashed(true);
  return { ok: true, name: copy.getName(), kept: Math.min(all.length, GRIM_BACKUP_KEEP) };
}

// The cell count Google applies to the 10 million limit is every cell in every tab's grid, empty ones too.
function grimUsage_() {
  const sheets = grimSheet_().getSheets();
  let cells = 0;
  for (let i = 0; i < sheets.length; i++) cells += sheets[i].getMaxRows() * sheets[i].getMaxColumns();
  return { ok: true, cells: cells, cellLimit: GRIM_CELL_LIMIT, driveUsed: DriveApp.getStorageUsed(), driveLimit: DriveApp.getStorageLimit() };
}

// Run by the weekly trigger.
function grimBackupTrigger() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) { console.error("grim backup skipped: script busy"); return; }
  try {
    const r = grimBackupNow_();
    console.log("Backup made: " + r.name + " (" + r.kept + " kept)");
  } finally {
    lock.releaseLock();
  }
}

// Run by hand, once, from the editor. Makes the weekly backup (Sundays, around 3 AM). Safe to run again:
// it replaces its own earlier trigger instead of adding a second one.
function grimInstallWeeklyBackup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "grimBackupTrigger") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("grimBackupTrigger").timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
  console.log("Weekly backup is set: Sundays around 3 AM.");
}

// Run by hand, once, from the editor, so Google asks for the Drive permission. Logs yes/no only.
function grimAuthorize() {
  DriveApp.getRootFolder();
  console.log("Drive access: OK");
  console.log("Backend version: " + GRIM_VERSION);
}
