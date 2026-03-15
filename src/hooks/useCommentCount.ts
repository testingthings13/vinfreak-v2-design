import { useCallback, useEffect, useState } from "react";
import { getCommentCount } from "@/lib/api";

export function useCommentCount(carId: string | null) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchCount = useCallback(async () => {
    if (!carId) return;
    try {
      setLoading(true);
      const data = await getCommentCount(carId);
      if (data && typeof data.count === "number") {
        setCount(data.count);
      }
    } catch {
      // Silent fallback
    } finally {
      setLoading(false);
    }
  }, [carId]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  const increment = useCallback(() => {
    setCount((prev) => (typeof prev === "number" ? prev + 1 : 1));
  }, []);

  return { count, loading, fetchCount, increment };
}
