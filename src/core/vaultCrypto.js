// Vault cryptography. Standard browser crypto only (WebCrypto): PBKDF2-SHA256 to turn the passphrase
// into a key-wrapping key, AES-256-GCM for everything else. No home-made crypto, no dependencies.
//
// Design (charter section 5): a random 256-bit DATA KEY encrypts everything. The passphrase only
// protects (wraps) the data key, so the passphrase can change without re-encrypting any data.
//
// Every ciphertext is bound to where it belongs with "additional data" (app|collection|record id, or
// the file id). A record copied into another row, or a file swapped for another, fails to decrypt.

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => {
  const s = globalThis.crypto && globalThis.crypto.subtle;
  if (!s) throw new Error("This browser has no WebCrypto (needs https)");
  return s;
};

export const DEFAULT_ITERATIONS = 600000; // OWASP guidance for PBKDF2-HMAC-SHA256
export const FORMAT = "g1";

export class VaultError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// ---- base64 (standard alphabet, with padding) ----
export function b64(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(text) {
  const s = atob(String(text));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
export const randomHex = (n) => [...randomBytes(n)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(bytes) {
  const d = new Uint8Array(await subtle().digest("SHA-256", bytes));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- passphrase -> key-wrapping key ----
export async function deriveWrapKey(passphrase, salt, iterations) {
  const base = await subtle().importKey("raw", enc.encode(String(passphrase).normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export const importDataKey = (raw, extractable = false) => subtle().importKey("raw", raw, { name: "AES-GCM" }, extractable, ["encrypt", "decrypt"]);

// ---- raw AES-GCM: output is iv (12 bytes) followed by ciphertext+tag ----
export async function sealBytes(key, bytes, aad) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0); out.set(ct, 12);
  return out;
}
export async function openBytes(key, sealed, aad) {
  if (!sealed || sealed.length < 28) throw new VaultError("corrupt", "Encrypted data is too short");
  try {
    return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: sealed.subarray(0, 12), additionalData: enc.encode(aad) }, key, sealed.subarray(12)));
  } catch {
    throw new VaultError("decrypt", "Could not decrypt (wrong key, or the data was changed)");
  }
}

// ---- text records: "g1.<base64(iv+ciphertext)>" ----
export async function sealJson(key, obj, aad) {
  return `${FORMAT}.${b64(await sealBytes(key, enc.encode(JSON.stringify(obj)), aad))}`;
}
export async function openJson(key, text, aad) {
  const s = String(text || "");
  if (!s.startsWith(FORMAT + ".")) throw new VaultError("corrupt", "Not an encrypted record");
  return JSON.parse(dec.decode(await openBytes(key, unb64(s.slice(FORMAT.length + 1)), aad)));
}

// ---- the vault key record (stored readable in the Sheet: it holds nothing usable without the passphrase) ----
export const KEY_AAD = "grimoire-vault-key-v1";

// New vault: fresh random data key, wrapped by the passphrase.
export async function createKeyRecord(passphrase, { iterations = DEFAULT_ITERATIONS } = {}) {
  const raw = randomBytes(32);
  const rec = await wrapKeyRecord(passphrase, raw, { iterations, keyId: randomHex(8) });
  return { record: rec, raw };
}

export async function wrapKeyRecord(passphrase, raw, { iterations = DEFAULT_ITERATIONS, keyId }) {
  const salt = randomBytes(16);
  const wrapKey = await deriveWrapKey(passphrase, salt, iterations);
  const wrapped = await sealBytes(wrapKey, raw, KEY_AAD + "|" + keyId);
  return { Salt: b64(salt), Iter: iterations, Wrapped: b64(wrapped), KeyId: keyId, Version: 1 };
}

// Returns { raw, key } or throws VaultError("passphrase"). "raw" is only for re-wrapping (change passphrase).
export async function unwrapKeyRecord(passphrase, rec) {
  const iterations = Number(rec.Iter);
  if (!Number.isFinite(iterations) || iterations < 1000) throw new VaultError("corrupt", "The vault key record looks damaged");
  const wrapKey = await deriveWrapKey(passphrase, unb64(rec.Salt), iterations);
  let raw;
  try {
    raw = await openBytes(wrapKey, unb64(rec.Wrapped), KEY_AAD + "|" + rec.KeyId);
  } catch {
    throw new VaultError("passphrase", "Wrong passphrase");
  }
  return { raw, key: await importDataKey(raw, false) };
}

// A fresh random per-file key, wrapped by the data key (so a later re-key only re-wraps small keys).
export async function newFileKey(dataKey, fileId) {
  const raw = randomBytes(32);
  const wrapped = await sealBytes(dataKey, raw, "filekey|" + fileId);
  return { key: await importDataKey(raw, false), wrapped: b64(wrapped) };
}
export async function openFileKey(dataKey, wrapped, fileId) {
  return importDataKey(await openBytes(dataKey, unb64(wrapped), "filekey|" + fileId), false);
}
// Re-key: the same per-file key, wrapped by the NEW data key. The file's bytes in Drive are untouched.
export async function rewrapFileKey(oldDataKey, newDataKey, wrapped, fileId) {
  const raw = await openBytes(oldDataKey, unb64(wrapped), "filekey|" + fileId);
  return b64(await sealBytes(newDataKey, raw, "filekey|" + fileId));
}
