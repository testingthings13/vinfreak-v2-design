import { useEffect, useMemo, useRef, useState } from "react";
import {
  LIKE_BURST_VARIANTS,
  getRandomBurstVariant,
} from "./likeBurstVariants";

const BURST_DURATION_MS = 1350;

export default function useLikeBurst(likeCount, likeSelected) {
  const defaultVariant = useMemo(
    () => LIKE_BURST_VARIANTS[0] ?? { id: "default", label: "🚗💥 +1!", className: "" },
    []
  );
  const [bursting, setBursting] = useState(false);
  const [variant, setVariant] = useState(defaultVariant);
  const previousRef = useRef({ count: likeCount, liked: likeSelected });
  const previousVariantRef = useRef(defaultVariant);
  const triggerTimeoutRef = useRef(null);
  const finishTimeoutRef = useRef(null);

  useEffect(() => {
    const previous = previousRef.current;
    const becameLiked = !previous.liked && likeSelected;
    const countIncreased = likeCount > previous.count;
    if ((becameLiked || countIncreased) && likeCount > 0) {
      if (triggerTimeoutRef.current) {
        clearTimeout(triggerTimeoutRef.current);
        triggerTimeoutRef.current = null;
      }
      if (finishTimeoutRef.current) {
        clearTimeout(finishTimeoutRef.current);
        finishTimeoutRef.current = null;
      }
      setBursting(false);
      triggerTimeoutRef.current = setTimeout(() => {
        triggerTimeoutRef.current = null;
        setVariant((prev) => {
          const nextVariant = getRandomBurstVariant(previousVariantRef.current?.id);
          previousVariantRef.current = nextVariant;
          return nextVariant ?? prev ?? defaultVariant;
        });
        setBursting(true);
      }, 0);
    }
    previousRef.current = { count: likeCount, liked: likeSelected };
  }, [defaultVariant, likeCount, likeSelected]);

  useEffect(() => {
    if (!bursting) return undefined;
    const timeout = setTimeout(() => {
      setBursting(false);
      finishTimeoutRef.current = null;
    }, BURST_DURATION_MS);
    finishTimeoutRef.current = timeout;
    return () => clearTimeout(timeout);
  }, [bursting]);

  useEffect(() => () => {
    if (triggerTimeoutRef.current) {
      clearTimeout(triggerTimeoutRef.current);
      triggerTimeoutRef.current = null;
    }
    if (finishTimeoutRef.current) {
      clearTimeout(finishTimeoutRef.current);
      finishTimeoutRef.current = null;
    }
  }, []);

  return { bursting, variant };
}
