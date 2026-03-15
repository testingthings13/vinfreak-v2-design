export default function KeyValueTable({ data }) {
  if (!data) return null;
  return (
    <div className="kv-table">
      {Object.entries(data).map(([k, v]) => (
        <div className="kv-row" key={k}>
          <div className="kv-k">{k}</div>
          <div className="kv-v">{typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)}</div>
        </div>
      ))}
    </div>
  );
}
