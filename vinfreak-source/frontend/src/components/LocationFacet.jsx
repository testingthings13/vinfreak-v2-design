export default function LocationFacet({
  value = "",
  onChange,
  onSubmit,
  status = "idle",
  error = "",
  placeholder = "92618 or enter another ZIP code",
  label = "Cars near you",
  inputId,
  className = "",
  idleButtonLabel = "Update ZIP code",
  loadingButtonLabel = "Updating…",
  disabled = false,
}) {
  const containerClassName = ["facet-card", "facet-card--location", className]
    .filter(Boolean)
    .join(" ");
  const isLoading = status === "loading";
  const buttonLabel = isLoading ? loadingButtonLabel : idleButtonLabel;
  const isButtonDisabled = isLoading || !onSubmit || disabled;

  return (
    <div className={containerClassName}>
      {label ? <span className="facet-label">{label}</span> : null}
      <div className="facet-location-row">
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange?.(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (!isLoading) {
                onSubmit?.();
              }
            }
          }}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => onSubmit?.()}
          disabled={isButtonDisabled}
        >
          {buttonLabel}
        </button>
      </div>
      {error ? (
        <p className="facet-location-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
