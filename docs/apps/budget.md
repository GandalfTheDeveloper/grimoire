# The Hoard — budget app spec (`budget`)

> **Status: approved by Isaac 2026-11-23 (charter v1.7). Round B1 built 2026-11-23 (app 0.12.0, backend 0.8.0): fake data only until device check M4 (security checklist) passes. B2 next.**
> This file lives in the **public** GitHub repo, so it never contains personal figures (income, balances, amounts, merchant names, account names or numbers). All of those are data, entered or imported in the app and stored encrypted in the Sheet. Examples below are generic.

---

## 1. What it is

One Grimoire app with seven sections that share the same income, accounts and balances:

| Section | Purpose |
|---|---|
| **Overview** | A month at a glance: money in, spending, saved; each section against plan; 12-month trends; savings and net worth lines; "last import" badge; count of transactions to review |
| **Plan** | Income and the budget plan (sections, line items, cadence, account, pull date, notes). Replaces the spreadsheet |
| **Transactions** | CSV import, automatic sorting by on-device rules, review list, splits, month-by-month history |
| **Balances** | Account balances over time (automatic from account-history files, manual for the rest), savings growth, net worth |
| **Mortgage** | Loan details, P&I + escrow history, extra-principal what-if, refinance break-even, market tracker |
| **Retirement** | FIRE calculator with saved scenarios and one pinned "Current plan" |
| **Goals** | The Rivian tool (faithful port, made live) plus a tracker of actual savings against its plan |

- **ID:** `budget`. **Display name:** "The Hoard" (the ID never changes).
- **Devices:** phone, tablet and computer browser. Every screen has to work at all three widths. Imports are easiest on a computer but must work on the phone (Files app picker).
- **Vault:** **yes, from day one.** Every record is encrypted on the device; the Sheet holds only `Payload` text. Exception: the public market-data tab (section 4.4).
- **Calendar feed:** yes. Recurring pull dates and annual/one-time charges are exposed in the standard feed format (date, title, app, color, tap-target).
- **Cross-app:** none at launch. Later: a Lists hook that adds an "Import budget statements" to-do (Lists isn't built yet). Until then, Budget shows its own "Last import: N days ago" badge. No notifications (charter).
- **Demo mode:** yes. Fake plan, fake balances and generated fake CSVs in both bank formats, in a separate on-device store, with **Clear demo data**.

---

## 2. Decisions and reasoning

| Decision | Reasoning |
|---|---|
| **One app, seven sections** (not separate apps) | Income, accounts and balances are shared. Separate apps would mean entering the same numbers in several places. |
| **Sorting runs on the device, by rules.** Claude never sees transactions. | Charter rule 2. Claude writes the rules engine and a starter rule set; the app learns from Isaac's corrections. |
| **The bank's own categories are ignored** (used only as a hint on the review screen) | Tested against a real export: the bank's categories were wrong too often (shoe store tagged Groceries, a festival's cashless vendors tagged Utilities, a warehouse club tagged Shopping). |
| **Two required files + one optional:** the spending export (all cards and accounts) plus the checking account-history export; optionally the savings account-history export | Least work for Isaac. The spending export covers spending across accounts; the history files supply paychecks, transfers and **balances** (they have a Balance column). |
| **The spending export is the only source of spending.** History files supply income, transfers, investment contributions and balances only | The same bill can appear in both files. One source avoids double counting. |
| **Savings is measured from balances, not a single account** | Bills are paid from the savings account, so its balance swings by thousands depending on the day. Saved this month = change in (checking + savings − card balance owed) + investment contributions. |
| **Months with no import show "no data", never "$0"** | Imports happen "whenever". A lazy quarter must not look like a frugal one. Coverage comes from each import's date range, not from whether transactions exist. |
| **Plan and income are effective-dated** | Changing a budget amount or a raise must not rewrite how past months compare. Each month is judged against the plan in force that month. |
| **Cadence per plan line:** monthly / annual (known month) / irregular with a yearly budget / one-time (dated) | Fixes prorated lumpy spending (airfare looking "over" every month you fly). Irregular lines are judged on year-to-date pace. Festival tickets become a one-time item instead of inflating Going out. |
| **A "Saving" section, separate from spending** | Automatic investment transfers were being counted as spending, which made the plan look like a monthly loss. Saving is gold, never red. |
| **Mortgage principal is counted toward net worth, not as consumption** | Part of each payment is equity. Overview shows the mortgage in spending (cash out), while Balances/net worth credits the principal. |
| **Fast food stays in Staples (food delivery counts as fast food); restaurants, bars, rides and events are Going out** | Isaac's split: fast food is utilitarian, going out is social and treating himself. |
| **Rides ask each time**, except airport rides (description contains "AIRPORT"), which go to Travel automatically | Isaac's rule: airport rides are travel, other rides are going out, and the app should ask when it sees a ride charge. |
| **Colors: grey background, red = spending, blue = money in, gold = savings, white = values you typed** (matching Golden Ratio) | Isaac's scheme. Plan amounts are typed, so the **plan target mark is white**; the actual is the colored bar, and a bar passing its mark gets an "over" label (red can't signal "over" because red already means spending). |
| **Rivian tool: same wording, layout and structure, made live** | Isaac's requirement: no verbiage or numbers change. Typed numbers on "What did it cost you" become formulas; each one is checked against its typed value at today's inputs (section 5.5). |
| **Market data is fetched by Apps Script on a timer, not by Claude** | The series are public and free (FRED: Freddie Mac weekly 30-year rate, 10-year Treasury, Fed funds). A deterministic fetch keeps working without Claude. Needs a charter addition (section 9). |
| **Personal values never ship in code.** Code has empty defaults; real values arrive through records | The repo is public. The starter plan, rules, account names and goal inputs are delivered as a one-time **seed file** imported while the vault is unlocked, kept outside the repo folder and deleted after import. |

---

## 3. Screens

### 3.1 Overview
- Month picker (swipe or arrows). Header numbers: **In** (blue), **Spent** (red), **Saved** (gold), plus coverage ("data through Oct 31").
- One row per section, expandable to lines: colored bar = actual, white mark = plan. Irregular lines show year-to-date against yearly budget with an "on pace / ahead / behind" label.
- 12-month chart: in / spent / saved bars. Lines: total cash (checking + savings − card owed), net worth.
- Badges: "Last import: N days ago", "N to review".

### 3.2 Plan
- **Income:** gross per year, per month, per check; taxes; benefit lines (each editable); take-home per check and per month. A check line compares planned take-home with paychecks actually seen in imports.
- **Sections:** House/Car, Saving, Subscriptions, Staples, Spending, One-time/Annual (renamable, reorderable, addable).
- **Line fields:** name, section, amount, cadence, account, pull date (text, e.g. "2nd–5th"), provider/notes, extra notes (long text). The mortgage line drills into P&I + escrow (section 3.5).
- Totals: monthly plan total, Saving total, plan In − Out. One-time/annual shown both as annual total and per-month equivalent.
- Every change asks for an **effective month** (default: this month).

### 3.3 Transactions
- **Import:** pick one or more CSVs. The app recognizes each format by its header row (section 4.3). Unknown format opens a column-mapping screen, saved as a new profile.
- **Import summary** before saving: rows read, new, duplicates skipped, pending skipped, refunds, transfers, sorted automatically, needs review, date range covered per account.
- **Review list:** each unsorted row shows description, amount, date, account and the bank's category as a hint. One tap assigns a line. After a manual assignment the app offers "Always put <merchant> here?" (creates a rule). "Ask" rules (rides) show the rule's choices as buttons.
- **Split:** divide one transaction across several lines (e.g. warehouse club: groceries + personal).
- **Browse:** by month, section, line, account; search; edit any assignment (rules don't retroactively change edited rows).

### 3.4 Balances
- Accounts list: checking, savings, credit card, brokerage, IRA/robo account, HSA, 401(k), mortgage (balance computed from amortization unless overridden).
- Checking and savings balances are filled automatically from history files (last balance of each day). Other accounts: manual monthly entry ("Update balances" screen, one field per account).
- Card balance owed = card charges since the last card payment (a card payment is recognized as a transfer), overridable.
- Charts: total cash, investments by account, net worth (optional home value).

### 3.5 Mortgage
- Loan: original amount, rate, term, start date, extra payments. P&I computed. Escrow history: effective-dated escrow amounts (taxes + insurance), so the Plan's mortgage line updates when escrow changes.
- Amortization: balance now, principal vs interest this month, payoff date.
- **Extra-principal what-if:** extra $/month → interest saved and payoff date, compared with the same money in a high-yield savings account at a chosen APY (after tax).
- **Refinance break-even:** closing costs, new rate, new term, planned sale date → monthly savings, months to break even, and the **break-even rate**: the highest rate that pays for itself before the sale date. Shown as a target line that drops as the sale date nears. Manual target rate also allowed.
- **Market tracker (round 5):** chart of your rate (flat), Freddie Mac 30-year average, 10-year Treasury, the spread (30-year − 10-year), and the **"10-year needed"** line = target rate − current spread (trailing 4-week average). Fed funds rate as context. Caveat on screen: the market average is not your quote (credit, loan-to-value and points move it). Time ranges: 1y, 5y, all.

### 3.6 Retirement
- **Inputs:** current age, retirement age, life expectancy, gross income, annual raise, inflation, pre- and post-retirement return, retirement spending **in today's dollars**, other income (Social Security estimate and start age, today's dollars), contributions per account (including employer match % and contribution % for a "new job" scenario).
- **Accounts by tax treatment:** traditional 401(k)/IRA (taxed on withdrawal, user-set effective rate), Roth (untaxed), taxable brokerage (gains portion taxed), HSA, cash. Starting balances can pull from Balances' latest values (switch).
- **Math in today's dollars** (real return = nominal − inflation), displayed both ways: "$X at 55 = $Y today".
- **Solve modes:** (a) given contributions, project balances and how long money lasts; (b) "retire at age A living like $S/yr today" → required nest egg and required monthly contribution; (c) given contributions and lifestyle → earliest retirement age.
- **Early-access check:** if retiring before 59½, flags the gap years that would need taxable/Roth/bridge money.
- **Bands:** conservative / expected / optimistic returns on the same chart. Randomized simulation is a later idea, not v1.
- **Scenarios:** save, rename, duplicate, delete; one pinned **Current plan**, opened by default.

### 3.7 Goals: Rivian tool
- Faithful port of the "Rivian Math and Future Projections" sheet and the "What did it cost you" sheet. The older third sheet (a hard-coded draft of the same math) is **not** ported.
- Every label, row, section and sentence keeps its wording. Generated sentences keep their exact templates with the numbers filled in live.
- Editable inputs = the sheet's blue assumption cells plus the salary goals, current income/take-home, down-payment cases, insurance, upfront costs, and the "What did it cost you" cost items (registration, tires, charging, maintenance) and return rates.
- Two formulas that hard-coded the goal salaries now reference the salary inputs (no change at current values).
- **Link to live budget income:** a switch, **off by default**, so nothing moves unless Isaac flips it.
- **Progress tracker:** planned savings curve (monthly contribution with HYSA growth, from the tool) vs actual balance of a chosen account or manual entries, with "ahead / behind by $X".

---

## 4. Data model

### 4.1 Tabs (all encrypted except `budget_market`)

| Tab | Holds | Notes |
|---|---|---|
| `budget_tx` (Sheet tab **`budget_txenc`**) | Transactions (one record per transaction or split part) | Largest tab, roughly 1,500 rows/year. Defined in B1, used from B2 |
| `budget_data` (Sheet tab **`budget_dataenc`**) | Everything else: income versions, plan lines, sections, accounts, rules, import batches, balance entries, mortgage, escrow versions, retirement scenarios, goal inputs and progress | Record type lives **inside** the encrypted payload |
| `budget_market` | Public market series (date, series, value) | Readable columns, written only by Apps Script (section 4.4) |

Envelope per charter: `Id, CreatedAt, UpdatedAt, SyncedAt, Deleted, SchemaVersion, Payload`.

**Real tab names (B1):** Grimoire's core names the encrypted twin of every collection `<collection>enc`, so the Sheet tabs are `budget_dataenc` and `budget_txenc`. A readable `budget_data` / `budget_tx` tab is only ever created if The Hoard is taken out of the Vault with the per-app switch. The charter's app index says `budget_tx`, `budget_data`; those are the collection names.

### 4.1b Record types (inside the encrypted payload, `{ Type, Data }`)
| Type | Data | Notes |
|---|---|---|
| `section` | `name, kind (spend / saving), order` | Not effective-dated: a rename applies to past months too |
| `linev` | `lineId, effective (yyyy-MM), name, sectionId, amount, cadence (monthly / annual / irregular / onetime), month (1–12, annual), date (yyyy-MM-dd, one-time), account (account id), pullDate (text), provider, notes, order, ended` | One record per **version** of a line. The version in force in a month is the latest `effective` not after it (tie: newest edit). `ended: true` stops the line from that month |
| `income` | `effective, grossYear, checksPerYear, lines: [{ name, kind (tax / benefit), perCheck }]` | One record per version. Take-home per check = gross / checks − all lines; per month = per check × checks / 12 |
| `account` | `name, kind, order, archived` | Kinds: checking, savings, card, brokerage, ira, hsa, k401, home, mortgage, otherAsset, otherDebt. Card, mortgage, otherDebt are owed (subtracted) |
| `bal` | `accountId, month (yyyy-MM), amount` | Manual balance. Owed amounts typed positive. A month with no entry carries the latest earlier one forward (never backward) |
| `rule`, `goal` | as given | Stored by the seed import now; read from B2 (rules) and B3 (goal inputs) |

### 4.2 Record ids
- **Transactions:** deterministic id = HMAC of `date | amount | original description | occurrence-within-file` with a key derived from the vault data key. Re-importing an overlapping file meets the same records (idempotent upsert), and the id reveals nothing without the vault.
- Everything else: random ids.

### 4.3 Import formats (headers only)
- **Spending export:** `Date, Description, Original Description, Amount, Type, Parent Category, Category, Account, Tags, Memo, Pending`. Amount positive; `Type` = Debit/Credit (Credit = refund, subtracted from its line); `Pending` TRUE rows skipped; `Original Description` is quoted and contains commas (real CSV parser required).
- **Account history:** `Account Number, Post Date, Check, Description, Debit, Credit, Status, Balance, Classification`. Debit and Credit are separate columns. `Classification` Paycheck → income; Transfer → transfer; anything else is matched against the spending export by amount and date (±3 days) and skipped if found, otherwise sent to review as "only in account history".
- Account names and numbers in the files map to app accounts through a mapping stored in `budget_data` (never in code).
- Dates are kept as `yyyy-MM-dd` text, parsed from `M/D/YYYY` without timezone conversion.

### 4.4 Market data (round 5)
- Apps Script time trigger, weekly: fetch FRED series (Freddie Mac 30-year weekly average, 10-year Treasury daily, Fed funds) and upsert rows into `budget_market` with the standard envelope. Public data only. The app reads it through the normal sync.
- Needs a charter addition: "script-written public data tabs" (section 9).

### 4.5 Rules
Ordered list. A rule matches on original description (contains / pattern), optionally amount range, account, day-of-month window, or "first match each month" (used for a membership charge that shares a merchant with extra purchases). Action: assign a line, mark as transfer/income, or **ask** with 2–4 choices. Rules apply only to newly imported rows; manual edits always win.

---

## 4.6 Seed file format (B1)
`{ "format": "thehoard-seed", "v": 1, "records": [ { "id", "type", "data" } ] }`. Ids are fixed in the file, so importing twice adds nothing and never overwrites an edit. The whole file is checked before anything is written (bad id, repeated id, unknown type, or a record missing what it needs: nothing is imported, and the message names the record). Imported from **The Hoard settings** (gear) while unlocked; always writes real records, even in demo mode. `.gitignore` ignores `*hoard-seed*` and `*.seed.json` as a guard.

## 4.7 Device-only vs synced (charter section 7)
- **Device-only:** demo mode and its records (`grimoire:budget:demo`), the open section (`grimoire:budget:tab`).
- **Synced:** everything else (all records, encrypted).

## 5. Build rounds (one chat each)

| Round | Scope | Done when |
|---|---|---|
| **B1** | App shell, vault records, Plan (income, sections, lines, cadence, effective dates), Balances (manual), Overview (plan only), demo mode, seed import | Seed imported on phone; plan matches the spreadsheet; demo passes on phone, tablet, computer |
| **B2** | Imports (both formats + mapper), dedupe, transfers, refunds, rules engine, review list, splits, coverage/"no data", automatic balances, Overview plan vs actual | A demo quarter imports correctly; a real import reviewed on device |
| **B3** | Goals: Rivian port + progress tracker | Every typed number reproduced within rounding (or Isaac picked) |
| **B4** | Retirement | Hand-checked scenarios match; save/pin works across devices |
| **B5** | Mortgage (loan, escrow history, what-ifs, break-even) + market tab via Apps Script | Charter addition approved; chart shows real FRED history |

### 5.1 What B1 built (app 0.12.0, backend 0.8.0)
- **App shell:** tile "The Hoard" (Coins icon) with the Vault lock; seven section tabs (scroll sideways on the phone, centred row from 700 px); one month picker shared by all sections (tap the month name to jump back to this month); its own settings panel (gear). Transactions, Mortgage, Retirement and Goals show which round builds them.
- **Theme:** Golden Ratio's grey; red `#F0453F` spending, blue (Shrexy turquoise) `#2FD9C0` money in, gold `#E3B23C` saving, white `#F4F7F6` typed values.
- **Plan:** income card (take-home per month and per check in blue, gross per year/month/check, each tax and benefit), totals (average month and this month: In, Spending, Saving, In − Out), sections with their lines (typed amounts white; yearly/irregular/one-time lines also show the monthly average and what lands this month), add/edit/move/delete sections, add/edit/move/stop/delete lines, "Changes" history per line and for income. Every money change asks **Takes effect from** (default this month; a new line defaults to the month being viewed). A note warns when a later change still overrides the chosen month. Empty plan: one tap adds the six standard section names from this spec.
- **Balances (manual):** accounts (add, rename, kind, hide, delete only if unused), **Update balances** for the chosen month (one box per account; empty = carry the last value), Total cash / Investments / Net worth tiles, charts: total cash, net worth, investments by account.
- **Overview (plan only):** In / Spent / Saved for the month (planned), badges "Plan only" and "No imports yet", sections with a white plan mark and expandable lines (irregular lines show year-to-date plan against the yearly budget), 12 months of planned In / Spent / Saved bars, total cash and net worth lines from Balances.
- **Calendar feed:** `calendarFeed(records, fromMonth, toMonth)` in `plan.js` returns the standard items (`date, title, app, color, target`) for monthly pull dates (first number in the pull-date text, clamped to the month's last day), yearly charges (their month) and one-time charges (their date). Not shown anywhere yet; ready for a merged calendar.
- **Demo mode:** a made-up plan (a raise and a changed grocery amount four months ago, an irregular line, yearly and one-time charges) and 12 months of made-up balances, built relative to today, in the device-only demo store. **Clear demo data** touches only that store.
- **Seed import:** section 4.6.
- **Backend 0.8.0:** `Grim_App_budget.gs` (tabs `data`, `tx`; their `enc` twins allowed automatically) and one line in `Grim_Router.gs`. Nothing interprets app fields.

### 5.2 B1 decisions
| Decision | Reasoning |
|---|---|
| Plan lines and income are stored as **versions** (one record per change), not one record holding a list of versions | Two devices editing different months never overwrite each other; "newest edit wins" only decides between two edits of the **same** month |
| Line **order** is not effective-dated: moving a line rewrites `order` on every version of the lines involved | Order is layout, not money; asking for a month to reorder would be noise |
| Section names and kinds are not effective-dated | A rename is a label fix. Moving a line to another section is effective-dated (it is part of the line's version) |
| Saved = In − Spending (planned saving included in Saved); In − Out = In − Spending − planned saving | Matches the spec's "Saving is gold, never red" and the spreadsheet's in-vs-out line |
| Owed amounts (card, mortgage) are typed as positive numbers | That is how statements show them; the sign comes from the account kind |
| Total cash and net worth are **two charts**, not two lines on one | Net worth includes the home, so on one axis total cash flattens into a line along the bottom |
| Charts: thin bars and 2 px lines, one value axis, legend for 2+ series, tap a month for a readout in words | No value depends on color alone; works with touch |
| The settings-panel seed import, not a Settings > Vault import | The Vault's Import/Export is a whole-app backup format; the seed is a hand-built file with its own checks |

### 5.5 Rivian formula check (B3)
For each typed number on "What did it cost you" (all-in total, invested-instead table, untouched-years table, per-month figure), build the formula, compute at current inputs, and compare. Within ~1%: keep the formula. Further off: show Isaac both and he picks.

---

## 6. Ideas rejected
- **Claude sorting transactions or plugged into the app:** violates charter rule 2. Replaced by on-device rules + starter rule set.
- **Using the bank's categories:** too often wrong (section 2).
- **Measuring savings from the savings account balance alone:** bills are paid from it, so it swings.
- **Prorating every lumpy cost monthly:** replaced by cadence.
- **Two independent "goal lines" for 10-year yield and spread:** they trade off against each other; one "10-year needed" line is the honest version.
- **Rate-drop alerts:** no notifications (charter).
- **Bank connections:** never (charter).

## 7. Gotchas and open questions
- **B1:** a hidden (closed) account keeps counting its last balance in net worth, carried forward. Enter 0 as its balance in the month it closed (the editor says so).
- **B1:** a month with no balance entries for any account shows "–", not $0.
- **B1:** the demo is regenerated relative to today only when demo mode is turned on with an empty demo store; after Clear demo data the next demo starts fresh.
- The card balance owed is derived (charges since last card payment). Mid-cycle snapshots may be off until the next payment posts; manual override exists.
- The spending export might include card payments or transfers in some months (October had none). Rules must recognize them as transfers.
- Accounts without exports (brokerage, robo account, HSA, 401(k)) depend on manual monthly balances.
- **Open:** mortgage loan details entered at B5. Optional monthly market brief written by Claude as a separate doc (public data only), decided at B5.
