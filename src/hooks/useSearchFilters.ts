import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { GetCarsFilters } from "@/lib/api";

export interface SearchFilters extends GetCarsFilters {
  page?: number;
  make?: string;
  model?: string;
  yearMin?: number;
  yearMax?: number;
  priceMin?: number;
  priceMax?: number;
  transmission?: string;
  source?: string;
  sort?: string;
  saleType?: string;
}

const NUM_KEYS = ["yearMin", "yearMax", "priceMin", "priceMax", "page"] as const;
const STR_KEYS = ["q", "make", "model", "transmission", "source", "sort", "saleType"] as const;

export function useSearchFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: SearchFilters = useMemo(() => {
    const f: SearchFilters = {};
    for (const k of STR_KEYS) {
      const v = searchParams.get(k);
      if (v) (f as any)[k] = v;
    }
    for (const k of NUM_KEYS) {
      const v = searchParams.get(k);
      if (v) {
        const n = Number(v);
        if (Number.isFinite(n)) (f as any)[k] = n;
      }
    }
    return f;
  }, [searchParams]);

  const setFilters = useCallback(
    (update: Partial<SearchFilters>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(update)) {
          if (value == null || value === "" || value === 0) {
            next.delete(key);
          } else {
            next.set(key, String(value));
          }
        }
        return next;
      }, { replace: true });
    },
    [setSearchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const hasActiveFilters = useMemo(() => {
    return [...STR_KEYS, ...NUM_KEYS].some(k => k !== "sort" && searchParams.has(k));
  }, [searchParams]);

  return { filters, setFilters, clearFilters, hasActiveFilters };
}
