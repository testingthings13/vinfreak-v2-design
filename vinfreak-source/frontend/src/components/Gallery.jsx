import { useCallback, useEffect, useMemo, useState } from "react";

export default function Gallery({ images }) {
  const items = useMemo(() => {
    if (!Array.isArray(images)) return [];
    const seen = new Set();
    const cleaned = [];
    for (const raw of images) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      cleaned.push(trimmed);
    }
    return cleaned;
  }, [images]);

  if (!items.length) return null;

  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const signature = useMemo(() => items.join("\u0000"), [items]);

  useEffect(() => {
    setIndex(0);
    setLoaded(false);
  }, [signature]);

  useEffect(() => {
    setLoaded(false);
  }, [index]);

  const lastIndex = items.length - 1;
  const safeIndex = Math.min(index, lastIndex);
  const activeImage = items[safeIndex];

  const prev = useCallback(() => {
    if (items.length <= 1) return;
    setIndex((current) => (current <= 0 ? lastIndex : current - 1));
  }, [items.length, lastIndex]);

  const next = useCallback(() => {
    if (items.length <= 1) return;
    setIndex((current) => (current >= lastIndex ? 0 : current + 1));
  }, [items.length, lastIndex]);

  const handleLoad = useCallback(() => setLoaded(true), []);

  return (
    <section className="gallery-shell">
      <div className="gallery-slider">
        <button
          type="button"
          className="nav prev"
          onClick={prev}
          aria-label="Previous image"
          disabled={items.length <= 1}
        >
          ‹
        </button>
        <img
          key={activeImage}
          src={activeImage}
          alt={`photo ${safeIndex + 1}`}
          loading="lazy"
          onLoad={handleLoad}
          className={`gallery-img${loaded ? " loaded" : ""}`}
        />
        <button
          type="button"
          className="nav next"
          onClick={next}
          aria-label="Next image"
          disabled={items.length <= 1}
        >
          ›
        </button>
      </div>
    </section>
  );
}
