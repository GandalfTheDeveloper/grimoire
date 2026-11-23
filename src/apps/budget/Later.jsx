// Sections that are built in later rounds (spec section 5). Shown so the layout is final from B1 on.
const TEXT = {
  mortgage: ["Round B5", "Loan, escrow history, extra-principal what-if, refinance break-even and the market tracker."],
  retirement: ["Round B4", "FIRE calculator with saved scenarios and one pinned Current plan."],
  goals: ["Round B3", "The Rivian tool, ported word for word and made live, with a savings tracker."],
};
export default function Later({ section }) {
  const [round, text] = TEXT[section] || ["Later", ""];
  return (
    <div className="hx-page" data-testid={`hx-later-${section}`}>
      <section className="hx-card hx-center">
        <span className="hx-badge">{round}</span>
        <p>{text}</p>
        <p className="hx-dim">Not built yet.</p>
      </section>
    </div>
  );
}
