export default function Chip({ label, onClear }) {
  return (
    <span className="chip">
      {label}
      {onClear && (
        <button type="button" className="chip-x" onClick={onClear} aria-label="Clear">
          ×
        </button>
      )}
    </span>
  );
}
