// Grimoire backend, The Hoard handler (backend 0.8.0).
// The Hoard is in the Vault from day one, so in practice only the encrypted twins are used:
// budget_dataenc (plan, income, accounts, balances, rules, goals) and budget_txenc (transactions, from round B2).
// Each row is the standard envelope plus one Payload column of scrambled text; the record type is inside it.
// The plain names are listed because that is how a handler declares a collection (its twin <name>enc is then
// allowed automatically), and so the per-app "Stop encrypting" switch keeps working like for any app.
// Nothing here interprets the app's fields. budget_market (public market data, script-written) comes in round B5.
function grimApp_budget_() {
  return {
    tabs: ["data", "tx"],
    files: false,
  };
}
