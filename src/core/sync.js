// Sync engine. Runs in the shell (never inside an app), so switching apps never interrupts it.
//
// How a round trip works (one request per page):
//   send   : records saved on this device but not yet confirmed (dirty), per collection
//   receive: confirmations, any records the Sheet holds that are newer than ours, and every record
//            the Sheet received since our cursor (judged by the Sheet's own clock, "SyncedAt")
// Newest UpdatedAt wins. Resending is harmless because the Sheet side is an idempotent upsert.
import { setSyncStatus, getSyncStatus } from "./syncStatus.js";
import { tabName } from "./data.js";

const PAGE_RECORDS = 100; // records sent per collection per request
const MAX_PAGES = 20;
const BEACON_LIMIT = 60000; // browsers cap a last-chance send at about 64 KB

export class SyncError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const clock = (t) => new Date(t).toTimeString().slice(0, 5);

export function createSync({
  data, db, getConfig, getApps, getDeviceId,
  fetchFn = (...a) => fetch(...a),
  beaconFn = (url, body) => (typeof navigator !== "undefined" && navigator.sendBeacon ? navigator.sendBeacon(url, body) : false),
  now = () => Date.now(),
  timeoutMs = 30000,
}) {
  let running = null;
  let again = null;
  let failures = 0;
  let retryTimer = null;
  let debounceTimer = null;
  let tickTimer = null;
  let tickCount = 0;
  let openApp = null;
  let started = false;
  const detach = [];

  const cursorKey = (app, coll) => `cursor:${app}|${coll}`;

  function pushError(message) {
    const list = [`${clock(now())} ${message}`, ...getSyncStatus().errors].slice(0, 10);
    setSyncStatus({ errors: list });
  }
  let extraPending = () => 0; // things waiting that are not records (files not uploaded yet)
  const afterSync = [];
  const pageApplied = []; // run after each page of results is applied (the Vault re-reads which apps are encrypted)
  // Which collections this device is actively reading. If a page of results changes it (an app was moved
  // into the Vault on another device), another round runs at once so the app does not open empty.
  const activeSig = () => data.collections().filter((d) => d.isActive()).map((d) => `${d.app}|${d.name}`).join(",");
  const refreshPending = () => setSyncStatus({ pending: data.pendingCount() + extraPending() });

  function recPayload(r) {
    return { id: r.id, createdAt: r.createdAt, updatedAt: r.updatedAt, deleted: r.deleted ? 1 : 0, schemaVersion: r.schemaVersion, cols: r.cols };
  }

  // One request to the backend. Key goes in the body, never the URL.
  async function call(body, { signal } = {}) {
    const cfg = getConfig();
    if (!cfg || !cfg.url || !cfg.key) throw new SyncError("not_configured", "Not connected yet (add the script URL and key in Settings)");
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetchFn(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids a CORS preflight against Apps Script
        body: JSON.stringify({ key: cfg.key, device: getDeviceId(), v: 1, ...body }),
        redirect: "follow",
        signal: signal || (ctl ? ctl.signal : undefined),
      });
    } catch (e) {
      throw new SyncError("network", e && e.name === "AbortError" ? "Timed out waiting for the Sheet" : "No connection to the Sheet");
    } finally {
      if (timer) clearTimeout(timer);
    }
    let json;
    try { json = await res.json(); } catch { throw new SyncError("bad_response", "The script URL did not answer like Grimoire's backend (wrong URL, or access not set to Anyone)"); }
    if (!json || json.ok !== true) {
      const code = (json && json.error) || "error";
      const msg = {
        auth: "The key was rejected",
        not_configured: "The backend has no key set yet",
        busy: "The Sheet was busy, will retry",
        bad_request: "The backend rejected the request",
      }[code] || `Backend error: ${code}`;
      throw new SyncError(code, msg);
    }
    return json;
  }

  async function buildItems(scope) {
    const apps = getApps();
    const items = [];
    const dirtyAll = await db.dirty();
    for (const def of data.collections()) {
      // Only pull the side an app is really using (readable or encrypted). Edits waiting to go up are
      // always sent, whichever side they are on, so a migration's new copy uploads while the app is frozen.
      const wanted = scope === "all" ? apps.includes(def.app) || def.app === "core" : def.app === openApp;
      const pullHere = wanted && def.isActive();
      const dirty = dirtyAll.filter((r) => r.app === def.app && r.coll === def.name);
      if (!pullHere && dirty.length === 0) continue;
      const since = await db.getMeta(cursorKey(def.app, def.name), 0);
      // on-demand collections (the self-test) stay out of normal syncs until they have data
      if (def.onDemand && dirty.length === 0 && !since) continue;
      items.push({
        app: def.app, coll: def.name, since,
        fields: def.codec.columns(def.fields),
        pull: pullHere,
        records: dirty.slice(0, PAGE_RECORDS).map(recPayload),
        _full: dirty.length > PAGE_RECORDS,
      });
    }
    return items;
  }

  async function applyResult(item, sent) {
    let more = false;
    if (item.error) { pushError(`${item.app}/${item.coll}: ${item.error}`); return false; }
    if (item.rejected && item.rejected.length) pushError(`${item.app}/${item.coll}: ${item.rejected.length} record(s) refused by the Sheet (too large or invalid), still waiting here`);
    const byId = new Map(sent.records.map((r) => [r.id, r]));
    for (const id of item.acked || []) {
      const r = byId.get(id);
      if (r) await data.markSynced(`${item.app}|${item.coll}|${id}`, r.updatedAt, item.batchTime);
    }
    for (const s of [...(item.stale || []), ...(item.records || [])]) {
      const out = await data.applyServer(item.app, item.coll, s);
      if (out === "overwrote-local") pushError(`${item.app}/${item.coll}: a newer edit from another device replaced one here`);
    }
    if (item.resetCursor) { await db.setMeta(cursorKey(item.app, item.coll), 0); more = true; }
    else if (item.cursor != null) await db.setMeta(cursorKey(item.app, item.coll), item.cursor);
    if (item.more) more = true;
    return more;
  }

  async function runOnce(scope) {
    const cfg = getConfig();
    setSyncStatus({ configured: !!(cfg && cfg.url && cfg.key) });
    if (!cfg || !cfg.url || !cfg.key) { refreshPending(); return; }
    let pages = 0;
    for (;;) {
      const sigBefore = activeSig();
      const items = await buildItems(scope);
      if (!items.length) break;
      const json = await call({ action: "sync", items: items.map(({ _full, ...rest }) => rest) });
      let again2 = false;
      for (let i = 0; i < items.length; i++) {
        const res = (json.items || [])[i] || {};
        if (await applyResult({ ...res, app: items[i].app, coll: items[i].coll }, items[i])) again2 = true;
        if (items[i]._full && !res.error) again2 = true;
      }
      setSyncStatus({ backendVersion: json.version || null });
      for (const fn of pageApplied) await fn();
      if (activeSig() !== sigBefore) again2 = true;
      refreshPending();
      pages += 1;
      if (!again2 || pages >= MAX_PAGES) break;
    }
    failures = 0;
    setSyncStatus({ lastSync: now(), lastError: null });
    refreshPending();
    // files waiting to upload go up after the records. A failure here is reported but does not fail the sync.
    for (const fn of afterSync) {
      try { await fn(); } catch (e) { pushError(e && e.message ? e.message : "Upload problem"); }
    }
    refreshPending();
  }

  function scheduleRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    const delay = Math.min(300000, 5000 * 3 ** Math.max(0, failures - 1));
    retryTimer = setTimeout(() => { retryTimer = null; syncNow("open"); }, delay);
  }

  function syncNow(scope = "all") {
    if (running) { again = again === "all" || scope === "all" ? "all" : "open"; return running; }
    running = (async () => {
      setSyncStatus({ syncing: true });
      try {
        await runOnce(scope);
      } catch (e) {
        failures += 1;
        const msg = e instanceof SyncError ? e.message : "Unexpected sync problem";
        setSyncStatus({ lastError: msg });
        pushError(msg);
        refreshPending();
        if (!(e instanceof SyncError) || e.code !== "not_configured") scheduleRetry();
      } finally {
        running = null;
        setSyncStatus({ syncing: false });
        if (again) { const s = again; again = null; syncNow(s); }
      }
    })();
    return running;
  }

  function request(scope = "open") {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debounceTimer = null; syncNow(scope); }, 1500);
  }

  // Last-chance send when the app is hidden. Needs no waiting: it reads the in-memory copy of pending
  // records. Nothing is marked as sent; if unconfirmed it simply resends on the next open.
  function flushBeacon() {
    const cfg = getConfig();
    const pending = data.dirtySnapshot();
    if (!cfg || !cfg.url || !cfg.key || pending.length === 0) return 0;
    const groups = new Map();
    for (const r of pending) {
      const k = `${r.app}|${r.coll}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    const items = [];
    for (const [k, recs] of groups) {
      const [app, coll] = k.split("|");
      const def = data.getDef(app, coll);
      if (!def) continue;
      items.push({ app, coll, fields: def.codec.columns(def.fields), pull: false, since: 0, records: recs.map(recPayload) });
    }
    let sent = 0;
    let batch = [];
    const send = () => {
      if (!batch.length) return;
      const body = JSON.stringify({ key: cfg.key, device: getDeviceId(), v: 1, action: "sync", beacon: true, items: batch });
      const ok = beaconFn(cfg.url, new Blob([body], { type: "text/plain;charset=UTF-8" }));
      if (ok) sent += batch.reduce((n, it) => n + it.records.length, 0);
      batch = [];
    };
    for (const it of items) {
      // split a collection into pieces that fit the size limit
      let piece = { ...it, records: [] };
      for (const r of it.records) {
        const trial = JSON.stringify([...batch, { ...piece, records: [...piece.records, r] }]);
        if (trial.length > BEACON_LIMIT && (piece.records.length || batch.length)) {
          if (piece.records.length) batch.push(piece);
          send();
          piece = { ...it, records: [] };
        }
        piece.records.push(r);
      }
      if (piece.records.length) batch.push(piece);
    }
    send();
    return sent;
  }

  function start({ getOpenApp } = {}) {
    if (started) return;
    started = true;
    const doc = typeof document !== "undefined" ? document : null;
    const win = typeof window !== "undefined" ? window : null;
    const onVis = () => {
      if (!doc) return;
      if (doc.visibilityState === "hidden") flushBeacon();
      else syncNow("all");
    };
    const onHide = () => flushBeacon();
    const onOnline = () => syncNow("all");
    if (doc) doc.addEventListener("visibilitychange", onVis);
    if (win) { win.addEventListener("pagehide", onHide); win.addEventListener("online", onOnline); }
    detach.push(() => {
      if (doc) doc.removeEventListener("visibilitychange", onVis);
      if (win) { win.removeEventListener("pagehide", onHide); win.removeEventListener("online", onOnline); }
    });
    detach.push(data.onWrite(() => { refreshPending(); request("open"); }));
    tickTimer = setInterval(() => {
      if (doc && doc.visibilityState === "hidden") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      tickCount += 1;
      if (getOpenApp) openApp = getOpenApp();
      syncNow(tickCount % 10 === 0 ? "all" : "open");
    }, 60000);
    detach.push(() => { clearInterval(tickTimer); tickTimer = null; });
    (async () => {
      await data.hydrate();
      refreshPending();
      if (getOpenApp) openApp = getOpenApp();
      syncNow("all");
    })();
  }

  function stop() {
    started = false;
    while (detach.length) detach.pop()();
    for (const t of [retryTimer, debounceTimer]) if (t) clearTimeout(t);
    retryTimer = null; debounceTimer = null;
  }

  return {
    start, stop, syncNow, request, flushBeacon, call,
    setOpenApp(id) { openApp = id; },
    setExtraPending(fn) { extraPending = fn; refreshPending(); },
    onAfterSync(fn) { afterSync.push(fn); },
    onPageApplied(fn) { pageApplied.push(fn); },
    refreshPending,
    tabName,
  };
}
