export default function Placeholder({ app }) {
  return (
    <div className="gr-body" data-testid={`placeholder-${app.id}`}>
      <p className="gr-empty"><b>{app.name}</b><br />Not built yet.<br /><br />{app.note}</p>
    </div>
  );
}
