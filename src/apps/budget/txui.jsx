// Shared pieces for transactions: the line picker, names, a transaction row, and learning a rule.
import { planForMonth, lineGroups, versionAt, accountsOf } from "./plan.js";
import { escapeRe } from "./imports.js";
import { fmt } from "./money.js";

export const KIND_TEXT = { spend: "Spending", refund: "Refund", income: "Income", transfer: "Transfer (not spending)", ignore: "Hidden", matched: "Already in the spending export" };

// Lines in force in `month`, grouped by section, then any other line (ended or not started) at the end.
export function lineOptions(records, month) {
  const plan = planForMonth(records, month);
  const groups = plan.sections.filter((s) => s.lines.length).map((s) => ({ label: s.name, kind: s.kind, lines: s.lines.map((l) => ({ id: l.lineId, name: l.name })) }));
  const inForce = new Set(plan.sections.flatMap((s) => s.lines.map((l) => l.lineId)));
  const other = [];
  for (const [id, vs] of lineGroups(records)) if (!inForce.has(id)) other.push({ id, name: (versionAt(vs, month) || vs[vs.length - 1]).data.name });
  if (other.length) groups.push({ label: "Other lines (not in this month's plan)", kind: "spend", lines: other.sort((a, b) => a.name.localeCompare(b.name)) });
  return groups;
}
export function lineNamer(records) {
  const g = lineGroups(records);
  return (id, month = "9999-12") => { const vs = g.get(id); if (!vs) return ""; return (versionAt(vs, month) || vs[vs.length - 1]).data.name; };
}
export function accountNamer(records) {
  const m = new Map(accountsOf(records, { includeArchived: true }).map((a) => [a.id, a.name]));
  return (id) => m.get(id) || "";
}

export function LineSelect({ groups, value, onChange, testid, placeholder = "Put on a line…" }) {
  return (
    <select className="hx-select" data-testid={testid} value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

// Money in a transaction row: red going out, blue coming in (refunds and income).
export function TxAmount({ d, testid }) {
  const isIn = d.dir === "in";
  return <span className={isIn ? "hx-blue" : d.kind === "transfer" || d.kind === "ignore" || d.kind === "matched" ? "hx-dim" : "hx-red"} data-testid={testid}>{isIn ? "+" : "−"}{fmt(d.amount, { forceCents: true })}</span>;
}

// "Always put <merchant> here?" (spec 3.3): a rule on the short description, placed before the starter rules
// so a merchant you sorted by hand wins over a broad pattern. Returns { rule, waiting } where waiting are
// other unsorted rows with the same description (sorted too, so you don't have to do them one by one).
export function learnRule(records, d, action) {
  const rules = records.filter((r) => r.type === "rule");
  const minOrder = rules.reduce((m, r) => Math.min(m, Number(r.data.order) || 0), 1000);
  const rule = { order: minOrder - 1, pattern: `^${escapeRe(d.desc)}$`, on: "desc", action, note: "learned from a manual sort" };
  const waiting = records.filter((r) => r.type === "tx" && r.data.status === "review" && !(r.data.choices || []).length && !r.data.lineId && r.data.desc === d.desc);
  return { rule, waiting };
}
