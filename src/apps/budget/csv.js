// A small, strict CSV reader (RFC 4180): quoted fields, commas and line breaks inside quotes, "" for a quote,
// CRLF or LF line ends, and a byte-order mark at the start. The spending export's Original Description is
// quoted and contains commas, so splitting on commas is never good enough (spec 4.3).
export function parseCsv(text) {
  const s = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", i = 0, quoted = false;
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"' && field === "") { quoted = true; i += 1; continue; }
    if (c === ",") { row.push(field); field = ""; i += 1; continue; }
    if (c === "\r" || c === "\n") {
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      i += c === "\r" && s[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += c; i += 1;
  }
  if (field !== "" || row.length) { row.push(field); if (row.length > 1 || row[0] !== "") rows.push(row); }
  return rows;
}

// Header row + objects keyed by header (trimmed). Blank header cells get "Column N".
export function csvTable(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h, i) => String(h).trim() || `Column ${i + 1}`);
  const out = rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] == null ? "" : String(r[i])])));
  return { headers, rows: out };
}

// Writes CSV (used only for the demo's generated files).
export function toCsv(headers, rows) {
  const cell = (v) => { const t = String(v ?? ""); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return [headers.map(cell).join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\r\n") + "\r\n";
}
