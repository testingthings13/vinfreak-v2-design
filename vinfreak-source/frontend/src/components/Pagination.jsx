export default function Pagination({
  page,
  setPage,
  total,
  pageSize,
  mode = "page",
  onPrev = null,
  onNext = null,
  canPrev = null,
  canNext = null,
}) {
  if (mode === "cursor") {
    const prev = typeof onPrev === "function" ? onPrev : () => setPage(Math.max(1, page - 1));
    const next = typeof onNext === "function" ? onNext : () => setPage(page + 1);
    const prevDisabled = typeof canPrev === "boolean" ? !canPrev : page <= 1;
    const nextDisabled = typeof canNext === "boolean" ? !canNext : false;
    const showTotal = typeof total === "number" && Number.isFinite(total) && total > 0;
    return (
      <div className="pagination">
        <button onClick={prev} disabled={prevDisabled}>Prev</button>
        <span>{showTotal ? `Page ${page} / ${Math.max(1, Math.ceil(total / pageSize))}` : `Page ${page}`}</span>
        <button onClick={next} disabled={nextDisabled}>Next</button>
      </div>
    );
  }
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const prev = () => setPage(Math.max(1, page-1));
  const next = () => setPage(Math.min(pages, page+1));
  return (
    <div className="pagination">
      <button onClick={prev} disabled={page<=1}>Prev</button>
      <span>Page {page} / {pages}</span>
      <button onClick={next} disabled={page>=pages}>Next</button>
    </div>
  );
}
