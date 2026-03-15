import { useEffect, useRef, useState } from "react";

export function usePriceHighlight(value, { duration = 1600 } = {}) {
  const [active, setActive] = useState(false);
  const timeoutRef = useRef(null);
  const prevRef = useRef(value);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const prev = prevRef.current;
    if (Object.is(prev, value)) {
      return undefined;
    }

    prevRef.current = value;

    if (value == null) {
      setActive(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return undefined;
    }

    setActive(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setActive(false);
      timeoutRef.current = null;
    }, duration);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [value, duration]);

  return active;
}

export default usePriceHighlight;
