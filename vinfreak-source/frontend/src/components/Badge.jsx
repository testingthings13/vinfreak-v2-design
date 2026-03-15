export default function Badge({ children, tone="muted" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
