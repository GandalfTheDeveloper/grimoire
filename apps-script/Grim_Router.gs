// Grimoire backend, part 1 of 3: the router. One entry point, one handler file per app.
// Everything here is prefixed grim / GRIM_ so it cannot collide with the old Shrexy script in the same project.
// The key lives in Script Properties (GRIMOIRE_KEY), never in this file, and arrives in the request body.

const GRIM_VERSION = "0.2.1";

// One line per app. Add a new app = add its handler file + one line here, then deploy a new version.
const GRIM_HANDLERS = {
  selftest: function () { return grimApp_selftest_(); },
};

function doGet(e) {
  // Public on purpose and tells nothing about your data. Lets you check which version is deployed.
  return grimOut_({ ok: true, app: "grimoire", version: GRIM_VERSION });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return grimOut_({ ok: false, error: "bad_request" });
  }
  try {
    const key = PropertiesService.getScriptProperties().getProperty("GRIMOIRE_KEY");
    if (!key || key.length < 32) return grimOut_({ ok: false, error: "not_configured" });
    if (!grimSafeEqual_(String(body.key || ""), key)) return grimOut_({ ok: false, error: "auth" });

    if (body.action === "ping") return grimOut_({ ok: true, version: GRIM_VERSION, serverTime: Date.now() });
    if (body.action === "sync" || body.action === "readback") return grimWithLock_(function () { return grimRoute_(body); });
    return grimOut_({ ok: false, error: "bad_request" });
  } catch (err) {
    console.error("grim error: " + (err && err.message)); // message only, never the request body
    return grimOut_({ ok: false, error: "server_error", detail: String((err && err.message) || "").slice(0, 200) });
  }
}

function grimRoute_(body) {
  const ss = grimSheet_();
  if (body.action === "readback") {
    const handler = grimHandler_(body.app);
    if (!handler || !handler.readback) return grimOut_({ ok: false, error: "bad_request" });
    return grimOut_({ ok: true, version: GRIM_VERSION, records: grimReadback_(ss, handler, body) });
  }
  const items = Array.isArray(body.items) ? body.items : null;
  if (!items || items.length > 20) return grimOut_({ ok: false, error: "bad_request" });
  const now = Date.now();
  const results = items.map(function (item) {
    const handler = grimHandler_(item && item.app);
    if (!handler) return { error: "unknown_app" };
    return grimSyncItem_(ss, handler, item, now, body.beacon === true);
  });
  SpreadsheetApp.flush();
  return grimOut_({ ok: true, version: GRIM_VERSION, serverTime: now, items: results });
}

function grimHandler_(app) {
  if (typeof app !== "string" || !Object.prototype.hasOwnProperty.call(GRIM_HANDLERS, app)) return null;
  return GRIM_HANDLERS[app]();
}

function grimSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("GRIMOIRE_SHEET_ID");
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

// Every sync takes the script lock, reads included: a read must never see half of another device's write.
function grimWithLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return grimOut_({ ok: false, error: "busy" });
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function grimSafeEqual_(a, b) {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function grimOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run this by hand from the editor to check setup. It logs yes/no only, never the key.
function grimCheckSetup() {
  const key = PropertiesService.getScriptProperties().getProperty("GRIMOIRE_KEY");
  console.log("Backend version: " + GRIM_VERSION);
  console.log("Key set: " + (key ? "yes (" + key.length + " characters)" : "NO"));
  console.log("Key long enough (32+): " + (key && key.length >= 32 ? "yes" : "NO"));
  console.log("Sheet found: " + (grimSheet_() ? "yes" : "NO"));
}
