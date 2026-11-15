// What apps actually call. defineCollection() registers a collection and, behind the scenes, its encrypted
// twin (<name>enc). The app gets one handle with the usual put / get / list / remove. Which side it reads
// and writes depends on whether the app is in the Vault, so turning encryption on or off later changes
// nothing in the app's code (charter: built so encryption can be switched on for any app).
//
// alwaysVault: true is for collections that must never exist in readable form (used by the vault self-test).
import { ENC_SUFFIX } from "./data.js";

export function createCollections({ data, vault }) {
  const byApp = new Map(); // app id -> its collection handles (migration and export walk these)
  function defineCollection(def) {
    if (def.name.length > 20 - ENC_SUFFIX.length) throw new Error(`collection name too long for an encrypted twin: ${def.name}`);
    const always = !!def.alwaysVault;
    const { alwaysVault, ...rest } = def;
    const side = () => (always ? "enc" : vault.activeSide(def.app));
    const plain = data.define({ ...rest, isActive: () => side() === "plain" });
    const encr = data.define({ ...rest, name: def.name + ENC_SUFFIX, logical: def.name, codec: vault.codec, isActive: () => side() === "enc" });
    const cur = () => (side() === "enc" ? encr : plain);
    const guarded = (fn) => async (...a) => { vault.guard(def.app, always); return cur()[fn](...a); };
    const handle = {
      app: def.app, name: def.name, fields: plain.def.fields,
      put: guarded("put"), get: guarded("get"), list: guarded("list"), remove: guarded("remove"),
      exportAll: guarded("exportAll"), importAll: guarded("importAll"),
      // used by migration, which manages both sides itself and bypasses the guard on purpose
      sides: { plain, enc: encr },
    };
    if (!byApp.has(def.app)) byApp.set(def.app, []);
    byApp.get(def.app).push(handle);
    return handle;
  }
  return { defineCollection, collectionsFor: (app) => byApp.get(app) || [] };
}
