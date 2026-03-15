import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CommentIcon from "./icons/CommentIcon";
import CommentsModal from "./CommentsModal";
import { getCommentCount } from "../api";

export default function CommentsBadge({ carId, carTitle, carImage, carMetaValue }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const scrollYRef = useRef(0);
  const safeCarId = carId == null ? null : String(carId);

  const fetchCount = useCallback(async () => {
    if (!safeCarId) return;
    try {
      setLoading(true);
      const data = await getCommentCount(safeCarId);
      if (data && typeof data.count === "number") {
        setCount(data.count);
      }
    } catch (error) {
      // Silent fallback – badge will show fallback glyph.
    } finally {
      setLoading(false);
    }
  }, [safeCarId]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  const handleOpen = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!safeCarId) return;
      if (typeof window !== "undefined") {
        scrollYRef.current = window.scrollY || window.pageYOffset || 0;
      }
      setIsModalOpen(true);
    },
    [safeCarId]
  );

  const handleClose = useCallback(() => {
    const savedScrollY = scrollYRef.current;
    setIsModalOpen(false);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        window.scrollTo({
          top: savedScrollY,
          left: 0,
          behavior: "auto",
        });
      });
    }
  }, []);

  const handleCommentApproved = useCallback(() => {
    setCount((prev) => {
      if (typeof prev === "number") return prev + 1;
      return 1;
    });
  }, []);

  const formattedCount = useMemo(() => {
    if (typeof count !== "number") return "—";
    try {
      return new Intl.NumberFormat().format(count);
    } catch (error) {
      return String(count);
    }
  }, [count]);

  const accessibleLabel = useMemo(() => {
    if (count == null) {
      return `View comments for ${carTitle || "this listing"}`;
    }
    return `View ${count} comments for ${carTitle || "this listing"}`;
  }, [count, carTitle]);

  return (
    <>
      <button
        type="button"
        className="card-comment-button"
        onClick={handleOpen}
        aria-haspopup="dialog"
        aria-expanded={isModalOpen}
        aria-label={accessibleLabel}
      >
        <CommentIcon className="comment-icon" />
        <span className="card-comment-count">{loading ? "…" : formattedCount}</span>
      </button>

      {isModalOpen && (
        <CommentsModal
          carId={safeCarId}
          carTitle={carTitle}
          carImage={carImage}
          carMetaValue={carMetaValue}
          onClose={handleClose}
          onCommentApproved={handleCommentApproved}
          refreshCount={fetchCount}
        />
      )}
    </>
  );
}
