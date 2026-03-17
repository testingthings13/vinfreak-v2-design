import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "vinfreak-favorites";

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFavorites(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

// Global listeners for cross-component sync
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((fn) => fn());
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);

  useEffect(() => {
    const sync = () => setFavorites(loadFavorites());
    listeners.add(sync);
    return () => { listeners.delete(sync); };
  }, []);

  const toggleFavorite = useCallback((carId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(carId)
        ? prev.filter((id) => id !== carId)
        : [...prev, carId];
      saveFavorites(next);
      notify();
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (carId: string) => favorites.includes(carId),
    [favorites]
  );

  return { favorites, toggleFavorite, isFavorite, count: favorites.length };
}
