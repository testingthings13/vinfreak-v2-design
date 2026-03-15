import LocationFacet from "./LocationFacet";

export default function Facets({
  sort,
  setSort,
  transmission,
  setTransmission,
  dealershipId,
  setDealershipId,
  dealerships = [],
  canUseDistance = true,
  nearestStatus = "idle",
  nearestLabelOverride,
  locationFocusValue = "",
  onLocationFocusChange,
  onLocationFocusSubmit,
  locationStatus = "idle",
  locationError = "",
  locationFocusPlaceholder = "",
}) {
  const nearestLabel = (() => {
    if (nearestLabelOverride) return nearestLabelOverride;
    switch (nearestStatus) {
      case "requesting":
        return "Nearest to me (locating...)";
      case "denied":
        return "Nearest to me (enable location)";
      case "unsupported":
        return "Nearest to me (unsupported)";
      case "ip":
        return "Nearest to me (auto)";
      case "manual":
        return "Nearest to me (ZIP applied)";
      default:
        return "Nearest to me";
    }
  })();

  const showLocationFocus = sort === "nearest";

  return (
    <div className="facets facets--modern">
      <div className="facet-card">
        <span className="facet-label">Sort</span>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="relevance">Recommended</option>
          <option value="recent">New listings</option>
          <option value="nearest" disabled={!canUseDistance && sort !== "nearest"}>
            {nearestLabel}
          </option>
          <option value="pca">PCA</option>
          <option value="manual_first">Manual transmission</option>
          <option value="end_time_asc">Auctions ending soonest</option>
          <option value="price_desc">Price: High to low</option>
          <option value="price_asc">Price: Low to high</option>
          <option value="year_desc">Year: Newest first</option>
          <option value="year_asc">Year: Oldest first</option>
          <option value="mileage_asc">Mileage: Low to high</option>
          <option value="mileage_desc">Mileage: High to low</option>
        </select>
      </div>

      {showLocationFocus && (
        <LocationFacet
          value={locationFocusValue}
          onChange={onLocationFocusChange}
          onSubmit={onLocationFocusSubmit}
          status={locationStatus}
          error={locationError}
          placeholder={locationFocusPlaceholder || "92618 or enter another ZIP code"}
        />
      )}

      <div className="facet-card">
        <span className="facet-label">Transmission</span>
        <select value={transmission} onChange={(e) => setTransmission(e.target.value)}>
          <option value="">All transmissions</option>
          <option value="Manual">Manual</option>
          <option value="Automatic">Automatic</option>
        </select>
      </div>

      <div className="facet-card">
        <span className="facet-label">Dealership</span>
        <select value={dealershipId} onChange={(e) => setDealershipId(e.target.value)}>
          <option value="">All dealerships</option>
          {dealerships.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
