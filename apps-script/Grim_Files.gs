// Grimoire backend: files and photos in Google Drive.
// Folder "Grimoire Files" in the owner's Drive, one subfolder per app. A file is stored as numbered parts
// (<fileId>.0, <fileId>.1 ...). The app sends and receives one part per request, so uploads are small,
// can be retried, and never need the script to glue a big file together. Vault apps' parts are encrypted
// on the device before they get here: this code only ever sees scrambled bytes and an id.
//
// Needs Drive permission. Run grimAuthorize once from the editor (see the setup steps).

const GRIM_PART_MAX = 2000000; // decoded bytes per part (the app sends 1.5 MB)
const GRIM_MAX_PARTS = 10;
const GRIM_FILEID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const GRIM_MIME_RE = /^[a-z0-9]+\/[a-z0-9.+-]{1,60}$/;

function grimFilesHandler_(app) {
  const h = grimHandler_(app);
  return h && h.files === true ? h : null;
}

function grimNamedFolder_(name, propKey) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(propKey);
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) { /* recreate below */ }
  }
  const made = DriveApp.createFolder(name);
  props.setProperty(propKey, made.getId());
  return made;
}

function grimAppFolder_(app) {
  const root = grimNamedFolder_("Grimoire Files", "GRIMOIRE_FILES_FOLDER_ID");
  const it = root.getFoldersByName(app);
  return it.hasNext() ? it.next() : root.createFolder(app);
}

function grimPartFile_(folder, fileId, index) {
  const it = folder.getFilesByName(fileId + "." + index);
  return it.hasNext() ? it.next() : null;
}

function grimFileArgs_(body) {
  if (!grimFilesHandler_(body.app)) return { error: "files_not_allowed" };
  if (!GRIM_FILEID_RE.test(String(body.fileId))) return { error: "bad_file_id" };
  return null;
}

function grimFilePut_(body) {
  const bad = grimFileArgs_(body);
  if (bad) return { ok: false, error: bad.error };
  const index = Number(body.index);
  if (!(index >= 0 && index < GRIM_MAX_PARTS && Math.floor(index) === index)) return { ok: false, error: "bad_part" };
  if (typeof body.data !== "string") return { ok: false, error: "bad_request" };
  const bytes = Utilities.base64Decode(body.data);
  if (bytes.length > GRIM_PART_MAX) return { ok: false, error: "part_too_big" };
  const mime = typeof body.mime === "string" && GRIM_MIME_RE.test(body.mime) ? body.mime : "application/octet-stream";
  const folder = grimAppFolder_(body.app);
  const old = grimPartFile_(folder, body.fileId, index);
  if (old) old.setTrashed(true); // a retried part replaces the earlier try
  folder.createFile(Utilities.newBlob(bytes, mime, body.fileId + "." + index));
  return { ok: true, index: index, size: bytes.length };
}

function grimFileGet_(body) {
  const bad = grimFileArgs_(body);
  if (bad) return { ok: false, error: bad.error };
  const index = Number(body.index);
  if (!(index >= 0 && index < GRIM_MAX_PARTS)) return { ok: false, error: "bad_part" };
  const file = grimPartFile_(grimAppFolder_(body.app), body.fileId, index);
  if (!file) return { ok: false, error: "not_found" };
  return { ok: true, index: index, data: Utilities.base64Encode(file.getBlob().getBytes()) };
}

// Moves the parts to the Drive bin (Drive keeps them there for 30 more days).
function grimFileDelete_(body) {
  const bad = grimFileArgs_(body);
  if (bad) return { ok: false, error: bad.error };
  const parts = Math.min(Number(body.parts) || 1, GRIM_MAX_PARTS);
  const folder = grimAppFolder_(body.app);
  let removed = 0;
  for (let i = 0; i < parts; i++) {
    const f = grimPartFile_(folder, body.fileId, i);
    if (f) { f.setTrashed(true); removed++; }
  }
  return { ok: true, removed: removed };
}
