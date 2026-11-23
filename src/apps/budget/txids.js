// The secret that transaction and automatic-balance ids are made with (spec 4.2).
//
// It is derived once from the Vault's data key and then stored as an encrypted record (fixed id), so:
//  - two devices that both import before syncing derive the same secret (same Vault key), and
//  - a later Vault re-key (new data key) does not change it, so re-importing an old file still meets the
//    same records instead of duplicating them. Re-key re-encrypts this record like any other.
// Demo mode uses a fixed made-up secret (demo records never leave the device).
import { vault } from "../../core/index.js";
import { b64 } from "../../core/vaultCrypto.js";
import { hmacKey } from "./imports.js";

export const IDKEY_ID = "hx-idkey-v1";
const DEMO_SECRET = "the-hoard-demo-mode-made-up-secret";

async function deriveFromVault() {
  const iv = new TextEncoder().encode("hoard-txid-1"); // 12 bytes, used for this one fixed input only
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, vault.key(), new Uint8Array(32));
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", ct)));
}

// realRecords: the real (not demo) records; putReal(id, type, data) writes one real record.
export async function idKeyFor({ demoOn, realRecords, putReal }) {
  if (demoOn) return hmacKey(DEMO_SECRET);
  const r = realRecords.find((x) => x.type === "idkey" && x.id === IDKEY_ID);
  if (r && r.data && r.data.secret) return hmacKey(r.data.secret);
  const secret = await deriveFromVault();
  await putReal(IDKEY_ID, "idkey", { secret });
  return hmacKey(secret);
}
