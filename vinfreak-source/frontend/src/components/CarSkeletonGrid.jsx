const SKELETON_COUNT = 12;

export default function CarSkeletonGrid({ count = SKELETON_COUNT }) {
  const total = Math.max(6, count || SKELETON_COUNT);
  return (
    <div className="loading-skeleton" role="status" aria-live="polite">
      <div className="skeleton-message">
        <span className="skeleton-message-sub">HOLD ON WHILE WE FIND YOU</span>
        <span
          className="skeleton-message-main glitch-text"
          data-text="FREAKISHLY COOL CARS"
        >
          FREAKISHLY COOL CARS
        </span>
      </div>
      <div className="grid skeleton-grid" aria-hidden="true">
        {Array.from({ length: total }).map((_, index) => (
          <div className="skeleton-card" key={index}>
            <div className="skeleton-media shimmer" />
            <div className="skeleton-body">
              <div className="skeleton-lines">
                <span className="skeleton-line long shimmer" />
                <span className="skeleton-line medium shimmer" />
              </div>
              <div className="skeleton-chips">
                <span className="skeleton-chip shimmer" />
                <span className="skeleton-chip shimmer" />
                <span className="skeleton-chip shimmer" />
              </div>
              <div className="skeleton-footer">
                <span className="skeleton-line short shimmer" />
                <span className="skeleton-line short shimmer" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
