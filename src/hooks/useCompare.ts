import { useState, useCallback, useEffect } from "react";
import { NormalizedCar } from "@/lib/normalizeCar";

const MAX_COMPARE = 3;
const STORAGE_KEY = "vinfreak-compare";

function loadCompareIds(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCompareIds(ids: string[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

// Global listeners
const listeners = new Set<() => void>();
function notify() { listeners.forEach((fn) => fn()); }

// Global car cache so compare page can access car data
const carCache = new Map<string, NormalizedCar>();

export function useCompare() {
  const [compareIds, setCompareIds] = useState<string[]>(loadCompareIds);

  useEffect(() => {
    const sync = () => setCompareIds(loadCompareIds());
    listeners.add(sync);
    return () => { listeners.delete(sync); };
  }, []);

  const toggleCompare = useCallback((carId: string, car?: NormalizedCar) => {
    setCompareIds((prev) => {
      const has = prev.includes(carId);
      let next: string[];
      if (has) {
        next = prev.filter((id) => id !== carId);
        carCache.delete(carId);
      } else {
        if (prev.length >= MAX_COMPARE) return prev; // max reached
        next = [...prev, carId];
        if (car) carCache.set(carId, car);
      }
      saveCompareIds(next);
      notify();
      return next;
    });
  }, []);

  const isComparing = useCallback(
    (carId: string) => compareIds.includes(carId),
    [compareIds]
  );

  const clearCompare = useCallback(() => {
    setCompareIds([]);
    saveCompareIds([]);
    carCache.clear();
    notify();
  }, []);

  const getCompareCars = useCallback((): NormalizedCar[] => {
    return compareIds.map((id) => carCache.get(id)).filter(Boolean) as NormalizedCar[];
  }, [compareIds]);

  const cacheCarData = useCallback((car: NormalizedCar) => {
    carCache.set(car.id, car);
  }, []);

  return {
    compareIds,
    toggleCompare,
    isComparing,
    clearCompare,
    getCompareCars,
    cacheCarData,
    count: compareIds.length,
    maxReached: compareIds.length >= MAX_COMPARE,
  };
}
