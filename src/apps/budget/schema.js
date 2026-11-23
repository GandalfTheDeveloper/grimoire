// The Hoard's records. The app is in the Vault from day one, so the Sheet only ever holds the standard
// envelope columns plus one encrypted Payload column (tabs budget_dataenc and budget_txenc: the core's
// encrypted twin of each collection is named <collection>enc).
//
// Two collections, each record = { Type, Data }: the record type lives INSIDE the encrypted payload (spec 4.1),
// so the Sheet cannot even tell a plan line from a balance.
//   data : everything except transactions (types below)
//   tx   : transactions (round B2; defined now so the tab and its encryption exist from the start)
//
// Types in "data" (Data is a JSON object; add fields later, never rename or remove):
//   section  { name, kind: "spend" | "saving", order }
//   linev    one VERSION of a plan line, in force from its month on:
//            { lineId, effective: "YYYY-MM", name, sectionId, amount, cadence: monthly|annual|irregular|onetime,
//              month (1-12, annual), date ("YYYY-MM-DD", one time), account (account id), pullDate (text),
//              provider, notes, order, ended (true = the line stops from this month) }
//   income   one version of income, in force from its month on:
//            { effective, grossYear, checksPerYear, lines: [{ name, kind: "tax" | "benefit", perCheck }] }
//   account  { name, kind (see ACCOUNT_KINDS in plan.js), order, archived }
//   bal      a manual balance: { accountId, month: "YYYY-MM", amount }  (owed amounts entered as positive)
//   rule     a sorting rule (spec 4.5): { order, pattern, action, months?, amountMin?, amountMax?,
//            firstEachMonth?, account?, days?, on? ("desc" = test the short description), note? }
//   goal     goal-tool inputs (used from round B3; may arrive early in the seed file)
//   profile  a saved column mapping for a bank file the app did not recognise:
//            { name, kind: "spend" | "hist", headerKey, map: { field: header }, sign, dateFmt }
//   acctmap  which app account a file's account belongs to: { key (account text, long numbers cut to the
//            last four), accountId }
//   batch    one import: { at, files: [{ kind, rows }], ranges: [{ kind, name, accounts, from, to }], summary }
//   idkey    the secret transaction ids are made with (spec 4.2): { secret }. One record, fixed id.
// Type in "tx": tx (see actuals.js for its fields).
export const RECORD_FIELDS = { Type: "text", Data: "json" };
export const COLLECTIONS = [
  { name: "data", fields: RECORD_FIELDS },
  { name: "tx", fields: RECORD_FIELDS },
];
export const TYPES = ["section", "linev", "income", "account", "bal", "rule", "goal", "profile", "acctmap", "batch", "idkey", "tx"];
// Which collection a record type lives in.
export const collOf = (type) => (type === "tx" ? "tx" : "data");

export const fromRecord = (r) => ({ id: r.id, type: r.Type, data: r.Data && typeof r.Data === "object" ? r.Data : {}, createdAt: r.createdAt, updatedAt: r.updatedAt });
export const toFields = (type, data) => ({ Type: type, Data: data });

// The six section names from the approved spec (public, no amounts). Offered as a one-tap start
// when there is no plan yet; nothing is created until Isaac taps it.
export const STANDARD_SECTIONS = [
  ["House/Car", "spend"], ["Saving", "saving"], ["Subscriptions", "spend"],
  ["Staples", "spend"], ["Spending", "spend"], ["One-time/Annual", "spend"],
];
