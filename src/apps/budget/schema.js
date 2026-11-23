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
//   rule     a sorting rule (used from round B2; may arrive early in the seed file)
//   goal     goal-tool inputs (used from round B3; may arrive early in the seed file)
export const RECORD_FIELDS = { Type: "text", Data: "json" };
export const COLLECTIONS = [
  { name: "data", fields: RECORD_FIELDS },
  { name: "tx", fields: RECORD_FIELDS },
];
export const TYPES = ["section", "linev", "income", "account", "bal", "rule", "goal"];

export const fromRecord = (r) => ({ id: r.id, type: r.Type, data: r.Data && typeof r.Data === "object" ? r.Data : {}, createdAt: r.createdAt, updatedAt: r.updatedAt });
export const toFields = (type, data) => ({ Type: type, Data: data });

// The six section names from the approved spec (public, no amounts). Offered as a one-tap start
// when there is no plan yet; nothing is created until Isaac taps it.
export const STANDARD_SECTIONS = [
  ["House/Car", "spend"], ["Saving", "saving"], ["Subscriptions", "spend"],
  ["Staples", "spend"], ["Spending", "spend"], ["One-time/Annual", "spend"],
];
