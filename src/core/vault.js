// The Vault: passphrase, lock/unlock, which apps are encrypted, and the codec that encrypts records.
//
// Rules (charter section 5):
//  - the data key is random; the passphrase only wraps it (so changing the passphrase re-encrypts nothing)
//  - phone stays unlocked until "Lock now" (key kept on the device as a non-extractable key object);
//    tablet never keeps it: the key lives in memory and the shell locks when a vault app is left
//  - the passphrase is not recoverable. There is no reset, no hint, no recovery key.
//  - the Sheet script never sees or interprets app fields; a vault record is { Payload } only
//
// What syncs: the wrapped key record (core_vault) and which apps are encrypted (core_vaultapps).
// What never syncs: the passphrase, the unwrapped key, and the lock state.
import {
  VaultError, createKeyRecord, unwrapKeyRecord, wrapKeyRecord, importDataKey, sealJson, openJson,
  DEFAULT_ITERATIONS,
} from "./vaultCrypto.js";

export const VAULT_ID = "vaultkey";
export const MIN_PASSPHRASE = 12;
const PERSIST_KEY = "vaultkey";

// States an app can be in. "in" and "out" mean a migration is running (the app is frozen).
//   off: readable tab   on: encrypted tab   in: moving readable -> encrypted   out: moving encrypted -> readable
export const APP_STATES = ["off", "on", "in", "out"];

function normalize(values, fields) {
  const out = {};
  for (const [name, type] of Object.entries(fields || {})) {
    const v = values ? values[name] : undefined;
    if (type === "number") out[name] = typeof v === "number" && Number.isFinite(v) ? v : null;
    else if (type === "bool") out[name] = !!v;
    else if (type === "json") out[name] = v === undefined ? null : v;
    else out[name] = v === undefined || v === null ? "" : String(v);
  }
  return out;
}

export function createVault({ data, db, sync, getDeviceType, defaults = {}, iterations = DEFAULT_ITERATIONS }) {
  const keyCol = data.define({
    app: "core", name: "vault",
    fields: { Salt: "text", Iter: "number", Wrapped: "text", KeyId: "text", Version: "number" },
  });
  const appsCol = data.define({ app: "core", name: "vaultapps", fields: { App: "text", State: "text" } });

  let dataKey = null; // CryptoKey, memory only (plus the phone's persisted copy)
  let keyId = null;
  let record = null; // the wrapped key record, as last read
  let appStates = {};
  let snap = { ready: false, setup: false, unlocked: false, apps: {} };
  const listeners = new Set();

  const emit = () => {
    snap = { ready: true, setup: !!record, unlocked: !!dataKey, apps: { ...appStates } };
    listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });
  };

  async function persist() {
    if (getDeviceType() !== "phone") return;
    try { await db.setMeta(PERSIST_KEY, { keyId, key: dataKey }); } catch { /* memory only is fine */ }
  }
  async function unpersist() { try { await db.delMeta(PERSIST_KEY); } catch { /* ignore */ } }

  async function refresh() {
    record = await keyCol.get(VAULT_ID);
    const rows = await appsCol.list();
    appStates = {};
    for (const r of rows) if (APP_STATES.includes(r.State)) appStates[r.App] = r.State;
    // another device re-keyed or replaced the vault: our key no longer matches, so lock
    if (dataKey && (!record || record.KeyId !== keyId)) { dataKey = null; keyId = null; await unpersist(); }
    emit();
  }

  // the sync engine waits for this after each page, so a newly encrypted app is pulled in the same sync
  if (sync) sync.onPageApplied(refresh);
  data.subscribe((info) => { if (info && info.app === "core" && (info.coll === "vault" || info.coll === "vaultapps")) refresh(); });

  async function init() {
    await db.open();
    await refresh();
    if (record && !dataKey && getDeviceType() === "phone") {
      try {
        const saved = await db.getMeta(PERSIST_KEY, null);
        if (saved && saved.key && saved.keyId === record.KeyId) { dataKey = saved.key; keyId = saved.keyId; emit(); }
      } catch { /* locked is the safe fallback */ }
    } else if (getDeviceType() !== "phone") await unpersist();
  }

  const aad = (ctx) => `${ctx.app}|${ctx.coll}|${ctx.id}`;
  const requireKey = () => { if (!dataKey) throw new VaultError("locked", "The Vault is locked"); return dataKey; };

  const codec = {
    columns: () => ["Payload"],
    async encode(values, fields, ctx) {
      return { Payload: await sealJson(requireKey(), normalize(values, fields), aad(ctx)) };
    },
    async decode(cols, fields, ctx) {
      const key = requireKey();
      if (!cols || !cols.Payload) return normalize({}, fields);
      return normalize(await openJson(key, cols.Payload, aad(ctx)), fields);
    },
  };

  function appState(app) {
    return Object.prototype.hasOwnProperty.call(appStates, app) ? appStates[app] : defaults[app] ? "on" : "off";
  }
  // Which physical side an app reads and writes right now.
  const activeSide = (app) => { const s = appState(app); return s === "on" || s === "out" ? "enc" : "plain"; };
  const isEncrypted = (app) => activeSide(app) === "enc";
  const isFrozen = (app) => { const s = appState(app); return s === "in" || s === "out"; };

  // Throws a VaultError if this app's data cannot be used right now.
  function guard(app, alwaysVault = false) {
    if (isFrozen(app)) throw new VaultError("busy", "This app is being moved in or out of the Vault. Try again in a moment.");
    if (alwaysVault || isEncrypted(app)) {
      if (!record) throw new VaultError("notsetup", "The Vault is not set up yet");
      if (!dataKey) throw new VaultError("locked", "The Vault is locked");
    }
  }

  async function setup(passphrase) {
    if (record) throw new VaultError("exists", "A Vault already exists. Unlock it instead.");
    if (String(passphrase || "").length < MIN_PASSPHRASE) throw new VaultError("short", `The passphrase needs at least ${MIN_PASSPHRASE} characters`);
    const { record: rec, raw } = await createKeyRecord(passphrase, { iterations });
    await keyCol.put(VAULT_ID, rec);
    dataKey = await importDataKey(raw, false);
    keyId = rec.KeyId;
    await persist();
    await refresh();
  }

  async function unlock(passphrase) {
    if (!record) throw new VaultError("notsetup", "The Vault is not set up yet");
    const { key } = await unwrapKeyRecord(passphrase, record);
    dataKey = key; keyId = record.KeyId;
    await persist();
    emit();
  }

  async function lock() {
    dataKey = null; keyId = null;
    await unpersist();
    emit();
  }

  // Needs the current passphrase (so a borrowed, unlocked phone cannot change it).
  async function changePassphrase(oldPassphrase, newPassphrase) {
    if (!record) throw new VaultError("notsetup", "The Vault is not set up yet");
    if (String(newPassphrase || "").length < MIN_PASSPHRASE) throw new VaultError("short", `The new passphrase needs at least ${MIN_PASSPHRASE} characters`);
    const { raw } = await unwrapKeyRecord(oldPassphrase, record);
    const next = await wrapKeyRecord(newPassphrase, raw, { iterations, keyId: record.KeyId });
    await keyCol.put(VAULT_ID, next);
    await refresh();
  }

  async function setAppState(app, state) {
    if (!APP_STATES.includes(state)) throw new Error("bad state");
    await appsCol.put(`app-${app}`, { App: app, State: state });
    await refresh();
  }

  return {
    init, refresh, setup, unlock, lock, changePassphrase, setAppState,
    codec, guard, appState, activeSide, isEncrypted, isFrozen,
    getState: () => snap,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // for files and anything else that needs the data key directly
    key: requireKey,
    get unlocked() { return !!dataKey; },
    get setupDone() { return !!record; },
  };
}
