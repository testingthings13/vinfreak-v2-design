export default function SearchBar({ value, onChange }) {
  return (
    <div className="search-wrap">
      <input
        className="search"
        placeholder="Search year, make, model, VIN, location…"
        value={value}
        onChange={e=>onChange(e.target.value)}
      />
    </div>
  );
}
