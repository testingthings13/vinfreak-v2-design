import { useState, useCallback, useEffect } from "react";
import { NormalizedCar } from "@/lib/normalizeCar";

const STORAGE_KEY = "vinfreak-recently-viewed";
const MAX_ITEMS = 12;

interface RecentCar {
  id: string;
  title: string;
  imageUrl: string;
  price: number | null;
  currency: string;
}

function loadRecent(): RecentCar[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(items: RecentCar[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

const listeners = new Set<() => void>();
function notify() { listeners.forEach((fn) => fn()); }

export function useRecentlyViewed() {
  const [recent, setRecent] = useState<RecentCar[]>(loadRecent);

  useEffect(() => {
    const sync = () => setRecent(loadRecent());
    listeners.add(sync);
    return () => { listeners.delete(sync); };
  }, []);

  const trackView = useCallback((car: NormalizedCar) => {
    setRecent((prev) => {
      // Deduplicate by id OR title to prevent duplicates from different API formats
      const filtered = prev.filter(
        (c) => c.id !== car.id && c.title !== car.title
      );
      const entry: RecentCar = {
        id: car.id,
        title: car.title,
        imageUrl: car.imageUrl,
        price: car.price,
        currency: car.currency,
      };
      const next = [entry, ...filtered].slice(0, MAX_ITEMS);
      saveRecent(next);
      notify();
      return next;
    });
  }, []);

  return { recent, trackView };
}
