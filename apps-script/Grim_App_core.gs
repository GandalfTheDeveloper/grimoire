// Grimoire's own collections (not an app): the Vault key record, which apps are encrypted, and file records.
// Tabs: core_vault, core_vaultapps, core_files (and core_filesenc, allowed automatically).
// core_vault holds the passphrase-wrapped data key. It is useless without the passphrase.

function grimApp_core_() {
  return {
    tabs: ["vault", "vaultapps", "files"],
    files: false, // core owns file records; the file bytes belong to the app that uploaded them
  };
}
