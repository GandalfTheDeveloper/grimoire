// Grimoire backend, part 2 of 3: the generic sync core.
// Rules (charter section 4): reads only the envelope columns, never interprets app fields; writes only
// changed rows; every column is plain text so Sheets cannot turn "8:45" into a time; newest UpdatedAt wins.

const GRIM_ENVELOPE = ["Id", "CreatedAt", "UpdatedAt", "SyncedAt", "Deleted", "SchemaVersion"];
const GRIM_NUMERIC = ["CreatedAt", "UpdatedAt", "SyncedAt", "Deleted", "SchemaVersion"];
const GRIM_PAGE = 500;
const GRIM_MAX_RECORDS = 200;
const GRIM_MAX_CELL = 45000; // a Sheets cell holds 50,000 characters
const GRIM_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const GRIM_FIELD_RE = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;
const GRIM_NAME_RE = /^[a-z][a-z0-9]{0,19}$/;

// ---------- repairing what Sheets does to values ----------

function grimIsDate_(v) {
  return Object.prototype.toString.call(v) === "[object Date]";
}

// Anything that comes back as a Date, number or boolean is turned back into the text we expect.
// A value anchored in 1899 is a time or duration Sheets converted ("8:45" became 8:45 AM, "32:15" became
// 32 hours 15 minutes). It is rebuilt as h:mm. Seconds are rounded away: this is a repair path only,
// since every column is written as plain text in the first place.
function grimNormalize_(v, tz) {
  if (v === null || v === undefined) return "";
  if (grimIsDate_(v)) {
    if (isNaN(v.getTime())) return "";
    const s = Utilities.formatDate(v, tz, "yyyy-MM-dd HH:mm:ss");
    const y = Number(s.slice(0, 4)), mo = Number(s.slice(5, 7)), da = Number(s.slice(8, 10));
    const h = Number(s.slice(11, 13)), mi = Number(s.slice(14, 16)), se = Number(s.slice(17, 19));
    if (y < 1900) {
      const days = Math.round((Date.UTC(y, mo - 1, da) - Date.UTC(1899, 11, 30)) / 86400000);
      let totalMin = (days * 24 + h) * 60 + mi + (se >= 30 ? 1 : 0);
      return Math.floor(totalMin / 60) + ":" + ("0" + (totalMin % 60)).slice(-2);
    }
    return h === 0 && mi === 0 && se === 0 ? s.slice(0, 10) : s;
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  return String(v);
}

function grimNum_(v, tz) {
  const n = Number(grimNormalize_(v, tz));
  return isFinite(n) ? n : 0;
}

// ---------- tabs and headers ----------

function grimColFormat_(name) {
  return GRIM_NUMERIC.indexOf(name) >= 0 ? "0" : "@";
}

// Returns the tab, creating it (and any missing columns) only when create is true.
function grimGetTab_(ss, tab, fieldCols, create) {
  let sh = ss.getSheetByName(tab);
  if (!sh) {
    if (!create) return null;
    sh = ss.insertSheet(tab);
  }
  if (!create) return sh;
  let headers = grimHeaders_(sh);
  const want = GRIM_ENVELOPE.concat(fieldCols.filter(function (c) { return GRIM_ENVELOPE.indexOf(c) < 0; }));
  const missing = want.filter(function (c) { return headers.indexOf(c) < 0; });
  if (missing.length) {
    const startCol = headers.length + 1;
    if (startCol + missing.length - 1 > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), startCol + missing.length - 1 - sh.getMaxColumns());
    missing.forEach(function (name, i) {
      const col = startCol + i;
      sh.getRange(1, col, sh.getMaxRows(), 1).setNumberFormat(grimColFormat_(name));
      sh.getRange(1, col).setValue(name);
    });
    if (headers.length === 0) sh.setFrozenRows(1);
    headers = headers.concat(missing);
  }
  return sh;
}

function grimHeaders_(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h); }).filter(function (h, i, a) {
    // trailing blank headers are not columns
    return h !== "" || a.slice(i).some(function (x) { return String(x) !== ""; });
  });
}

function grimReadRows_(sh, ncols) {
  const last = sh.getLastRow();
  return last >= 2 ? sh.getRange(2, 1, last - 1, ncols).getValues() : [];
}

function grimRowToRecord_(row, hdr, headers, tz) {
  const cols = {};
  headers.forEach(function (h, i) {
    if (GRIM_ENVELOPE.indexOf(h) < 0 && h !== "") cols[h] = grimNormalize_(row[i], tz);
  });
  return {
    id: grimNormalize_(row[hdr.Id], tz),
    createdAt: grimNum_(row[hdr.CreatedAt], tz),
    updatedAt: grimNum_(row[hdr.UpdatedAt], tz),
    syncedAt: grimNum_(row[hdr.SyncedAt], tz),
    deleted: grimNum_(row[hdr.Deleted], tz),
    schemaVersion: grimNum_(row[hdr.SchemaVersion], tz) || 1,
    cols: cols,
  };
}

// ---------- the sync of one collection ----------

function grimSyncItem_(ss, handler, item, now, beacon) {
  const app = item.app, coll = item.coll;
  if (!GRIM_NAME_RE.test(String(coll)) || handler.tabs.indexOf(coll) < 0) return { error: "unknown_collection" };
  const tab = app + "_" + coll;
  const records = Array.isArray(item.records) ? item.records : [];
  if (records.length > GRIM_MAX_RECORDS) return { error: "too_many_records" };
  const fieldCols = Array.isArray(item.fields) ? item.fields : [];
  for (let i = 0; i < fieldCols.length; i++) {
    if (!GRIM_FIELD_RE.test(String(fieldCols[i])) || GRIM_ENVELOPE.indexOf(fieldCols[i]) >= 0) return { error: "bad_field_name" };
  }
  const since = Number(item.since) || 0;
  const wantPull = item.pull !== false && !beacon;
  const tz = ss.getSpreadsheetTimeZone();

  const sh = grimGetTab_(ss, tab, fieldCols, records.length > 0);
  if (!sh) {
    // no tab yet: nothing to send back. A cursor from before a restore is reset.
    return { acked: [], stale: [], records: [], cursor: 0, more: false, resetCursor: since > 0 };
  }
  const headers = grimHeaders_(sh);
  const hdr = Object.create(null);
  headers.forEach(function (h, i) { hdr[h] = i; });
  for (let i = 0; i < GRIM_ENVELOPE.length; i++) if (hdr[GRIM_ENVELOPE[i]] === undefined) return { error: "tab_missing_columns" };

  const rows = grimReadRows_(sh, headers.length);
  const index = Object.create(null);
  let maxSynced = 0;
  rows.forEach(function (r, i) {
    index[grimNormalize_(r[hdr.Id], tz)] = i;
    maxSynced = Math.max(maxSynced, grimNum_(r[hdr.SyncedAt], tz));
  });

  const batchTime = Math.max(now, maxSynced + 1);
  const acked = [], stale = [], rejected = [], writtenIds = Object.create(null);
  const dirtyRows = {}; // row array index -> true (existing rows to rewrite)
  const appended = []; // new row arrays

  records.forEach(function (rec) {
    if (!rec || !GRIM_ID_RE.test(String(rec.id)) || !isFinite(Number(rec.updatedAt)) || typeof rec.cols !== "object" || rec.cols === null) {
      rejected.push(rec && rec.id ? String(rec.id).slice(0, 64) : "?");
      return;
    }
    // too big for one cell: refuse, never cut it short (a cut-off record would be silent data loss)
    for (const name in rec.cols) {
      if (rec.cols[name] !== null && rec.cols[name] !== undefined && String(rec.cols[name]).length > GRIM_MAX_CELL) { rejected.push(String(rec.id)); return; }
    }
    const updatedAt = Number(rec.updatedAt);
    const deleted = rec.deleted ? 1 : 0;
    const existingIdx = index[rec.id];
    let row;
    if (existingIdx !== undefined) {
      const cur = rows[existingIdx];
      const curUpdated = grimNum_(cur[hdr.UpdatedAt], tz);
      if (curUpdated > updatedAt) { stale.push(grimRowToRecord_(cur, hdr, headers, tz)); return; }
      if (curUpdated === updatedAt && grimNum_(cur[hdr.Deleted], tz) === deleted) { acked.push(rec.id); return; }
      row = cur.slice();
    } else {
      row = headers.map(function () { return ""; });
    }
    for (const name in rec.cols) {
      if (hdr[name] === undefined || GRIM_ENVELOPE.indexOf(name) >= 0) continue;
      row[hdr[name]] = rec.cols[name] === null || rec.cols[name] === undefined ? "" : String(rec.cols[name]);
    }
    const prevCreated = existingIdx !== undefined ? grimNum_(rows[existingIdx][hdr.CreatedAt], tz) : 0;
    row[hdr.Id] = String(rec.id);
    row[hdr.CreatedAt] = prevCreated || Number(rec.createdAt) || updatedAt;
    row[hdr.UpdatedAt] = updatedAt;
    row[hdr.SyncedAt] = batchTime;
    row[hdr.Deleted] = deleted;
    row[hdr.SchemaVersion] = Number(rec.schemaVersion) || 1;
    if (existingIdx !== undefined) { rows[existingIdx] = row; dirtyRows[existingIdx] = true; }
    else { rows.push(row); index[rec.id] = rows.length - 1; appended.push(rows.length - 1); }
    acked.push(rec.id);
    writtenIds[rec.id] = true;
  });

  grimWriteChanged_(sh, headers, rows, dirtyRows, appended);

  // pull: everything the Sheet received after the cursor, except what this very request just wrote
  let outRecords = [], cursor = since, more = false, resetCursor = false;
  if (wantPull) {
    const tabMax = Object.keys(writtenIds).length ? batchTime : maxSynced;
    if (since > tabMax) {
      resetCursor = true;
      cursor = 0;
    } else {
      const cand = [];
      rows.forEach(function (r) {
        const s = grimNum_(r[hdr.SyncedAt], tz);
        if (s > since && !writtenIds[grimNormalize_(r[hdr.Id], tz)]) cand.push({ s: s, r: r });
      });
      cand.sort(function (a, b) { return a.s - b.s; });
      let take = Math.min(cand.length, GRIM_PAGE);
      while (take < cand.length && cand[take].s === cand[take - 1].s) take++; // never split a batch
      more = take < cand.length;
      outRecords = cand.slice(0, take).map(function (c) { return grimRowToRecord_(c.r, hdr, headers, tz); });
      cursor = more ? cand[take - 1].s : Math.max(tabMax, since);
    }
  }
  return { acked: acked, rejected: rejected, stale: stale, records: outRecords, cursor: cursor, more: more, resetCursor: resetCursor, batchTime: batchTime };
}

// Sheets treats a leading = as a formula and swallows a leading apostrophe, even in a plain-text cell.
// A leading apostrophe is Sheets' own "this is text" marker and is not stored, so adding one in front of
// such values keeps them exactly as the app sent them. Applied to every text cell at the moment of writing,
// including cells of columns this request did not touch (they were read back as plain text).
function grimTextCell_(v) {
  if (typeof v !== "string" || v === "") return v;
  const c = v.charAt(0);
  return c === "=" || c === "'" ? "'" + v : v;
}

function grimProtectRow_(row, headers) {
  return row.map(function (v, i) { return GRIM_NUMERIC.indexOf(headers[i]) >= 0 ? v : grimTextCell_(v); });
}

// Writes only the rows that changed. Neighbouring changed rows go out as one block; new rows as one block.
function grimWriteChanged_(sh, headers, rows, dirtyRows, appended) {
  const ncols = headers.length;
  const idx = Object.keys(dirtyRows).map(Number).sort(function (a, b) { return a - b; });
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    const block = idx.slice(i, j + 1).map(function (k) { return grimProtectRow_(rows[k], headers); });
    sh.getRange(idx[i] + 2, 1, block.length, ncols).setValues(block);
    i = j + 1;
  }
  if (appended.length) {
    const firstRow = appended[0] + 2;
    const lastRowNeeded = appended[appended.length - 1] + 2;
    if (lastRowNeeded > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), lastRowNeeded - sh.getMaxRows() + 100);
    const range = sh.getRange(firstRow, 1, appended.length, ncols);
    const formats = appended.map(function () { return headers.map(function (h) { return grimColFormat_(h); }); });
    range.setNumberFormats(formats); // text first, then values, so nothing gets converted
    range.setValues(appended.map(function (k) { return grimProtectRow_(rows[k], headers); }));
  }
}

// For the in-app sync test only (handler.readback): returns the named rows as stored.
function grimReadback_(ss, handler, body) {
  const coll = String(body.coll);
  if (!GRIM_NAME_RE.test(coll) || handler.tabs.indexOf(coll) < 0) return [];
  const sh = ss.getSheetByName(body.app + "_" + coll);
  if (!sh) return [];
  const tz = ss.getSpreadsheetTimeZone();
  const headers = grimHeaders_(sh);
  const hdr = Object.create(null);
  headers.forEach(function (h, i) { hdr[h] = i; });
  const want = Object.create(null);
  (Array.isArray(body.ids) ? body.ids : []).slice(0, 50).forEach(function (id) { want[id] = true; });
  return grimReadRows_(sh, headers.length)
    .map(function (r) { return grimRowToRecord_(r, hdr, headers, tz); })
    .filter(function (rec) { return want[rec.id]; });
}
