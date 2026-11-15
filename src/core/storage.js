// Device-local storage. Every key is prefixed "grimoire:<scope>:" (charter rule: no unprefixed keys).
const PREFIX = "grimoire:";

function key(scope, name) {
  return `${PREFIX}${scope}:${name}`;
}

export function getItem(scope, name, fallback) {
  try {
    const raw = window.localStorage.getItem(key(scope, name));
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setItem(scope, name, value) {
  try {
    window.localStorage.setItem(key(scope, name), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function allKeys() {
  try {
    return Object.keys(window.localStorage);
  } catch {
    return [];
  }
}

// Ask the browser not to evict our data. Best effort; result shown in Diagnostics.
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}
