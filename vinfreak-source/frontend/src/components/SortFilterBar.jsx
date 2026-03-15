export default function SortFilterBar({
  sort,
  setSort,
  minYear,
  setMinYear,
  maxYear,
  setMaxYear,
  transmission,
  setTransmission,
  dealershipId,
  setDealershipId,
  dealerships = [],
  statusFilter = "all",
  setStatusFilter,
}) {
  return (
    <div className="filters">
      <label className="field">
        <span>Sort</span>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="relevance">Recommended</option>
          <option value="recent">New listings</option>
          <option value="nearest">Nearest to me</option>
          <option value="pca">PCA</option>
          <option value="manual_first">Manual transmission</option>
          <option value="end_time_asc">Auctions ending soonest</option>
          <option value="price_asc">Price: Low to high</option>
          <option value="price_desc">Price: High to low</option>
          <option value="year_desc">Year: Newest first</option>
          <option value="year_asc">Year: Oldest first</option>
          <option value="mileage_asc">Mileage: Low to high</option>
          <option value="mileage_desc">Mileage: High to low</option>
        </select>
      </label>

      <label className="field">
        <span>Min Year</span>
        <input
          type="number"
          value={minYear ?? ""}
          onChange={(e) => setMinYear(e.target.value ? Number(e.target.value) : null)}
        />
      </label>

      <label className="field">
        <span>Max Year</span>
        <input
          type="number"
          value={maxYear ?? ""}
          onChange={(e) => setMaxYear(e.target.value ? Number(e.target.value) : null)}
        />
      </label>

      <label className="field">
        <span>Transmission</span>
        <select value={transmission} onChange={(e) => setTransmission(e.target.value)}>
          <option value="">All</option>
          <option value="Manual">Manual</option>
          <option value="Automatic">Automatic</option>
        </select>
      </label>

      <label className="field">
        <span>Dealership</span>
        <select value={dealershipId} onChange={(e) => setDealershipId(e.target.value)}>
          <option value="">All</option>
          {dealerships.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      {setStatusFilter && (
        <label className="field">
          <span>Auction Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Cars</option>
            <option value="live">Live Auction</option>
            <option value="nonauction">Non-Auction</option>
          </select>
        </label>
      )}
    </div>
  );
}
