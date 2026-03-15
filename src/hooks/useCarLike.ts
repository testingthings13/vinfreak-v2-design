import { useCallback, useEffect, useRef, useState } from "react";
import { setCarLike } from "@/lib/api";

const coerceCount = (value: any): number => {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed);
  }
  return 0;
};

const coerceLiked = (value: any): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    return ["true", "yes", "1", "liked"].includes(value.trim().toLowerCase());
  }
  return false;
};

const STORAGE_KEY = "vinfreak:car-like-state";

const readStoredLike = (carId: string) => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const entry = parsed?.[carId];
    if (!entry) return null;
    return { liked: coerceLiked(entry.liked) };
  } catch {
    return null;
  }
};

const writeStoredLike = (carId: string, liked: boolean) => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data[carId] = { liked, timestamp: Date.now() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
};

export function useCarLike(
  carId: string | null,
  initialCount: any,
  initialLiked: any
) {
  const [state, setState] = useState(() => ({
    count: coerceCount(initialCount),
    liked: coerceLiked(initialLiked),
    saving: false,
  }));
  const latestRef = useRef(state);

  useEffect(() => {
    latestRef.current = state;
  }, [state]);

  useEffect(() => {
    const stored = carId ? readStoredLike(carId) : null;
    const next = {
      count: coerceCount(initialCount),
      liked: stored?.liked ?? coerceLiked(initialLiked),
      saving: false,
    };
    setState(next);
    latestRef.current = next;
  }, [carId, initialCount, initialLiked]);

  const addLike = useCallback(async () => {
    if (!carId) return;
    const prev = latestRef.current;
    if (prev.liked) return; // Already liked, V1 doesn't allow unlike

    const optimistic = { count: prev.count + 1, liked: true, saving: true };
    setState(optimistic);
    latestRef.current = optimistic;
    writeStoredLike(carId, true);

    try {
      const payload = await setCarLike(carId, true);
      const resolved = {
        count: coerceCount(payload?.count ?? optimistic.count),
        liked: coerceLiked(payload?.liked ?? true),
        saving: false,
      };
      setState(resolved);
      latestRef.current = resolved;
      writeStoredLike(carId, resolved.liked);
    } catch {
      // Revert on error
      setState({ ...prev, saving: false });
      latestRef.current = { ...prev, saving: false };
      writeStoredLike(carId, prev.liked);
    }
  }, [carId]);

  return { count: state.count, liked: state.liked, saving: state.saving, addLike };
}
