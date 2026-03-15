import { useCallback, useEffect, useRef, useState } from "react";
import { setCarLike } from "../api";

const coerceCount = (value) => {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.round(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed);
  }
  return 0;
};

const coerceLiked = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return false;
    return ["true", "yes", "1", "liked"].includes(trimmed);
  }
  return false;
};

const STORAGE_KEY = "vinfreakdev:car-like-state";

const safeSessionStorage = () => {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage ?? null;
  } catch (error) {
    console.warn("Unable to access sessionStorage", error);
    return null;
  }
};

const readStoredLike = (carId) => {
  if (!carId) return null;
  const storage = safeSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const entry = parsed[String(carId)];
    if (!entry || typeof entry !== "object") return null;
    return {
      liked: coerceLiked(entry.liked),
      timestamp: typeof entry.timestamp === "number" ? entry.timestamp : null,
    };
  } catch (error) {
    console.warn("Failed to read like state from sessionStorage", error);
    return null;
  }
};

const writeStoredLike = (carId, liked) => {
  if (!carId) return;
  const storage = safeSessionStorage();
  if (!storage) return;
  const id = String(carId);
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const data = parsed && typeof parsed === "object" ? parsed : {};
    data[id] = { liked: Boolean(liked), timestamp: Date.now() };
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Failed to persist like state to sessionStorage", error);
  }
};

export default function useCarLike(
  carId,
  initialCount,
  initialLiked,
  { onError } = {},
) {
  const [state, setState] = useState(() => ({
    count: coerceCount(initialCount),
    liked: coerceLiked(initialLiked),
    saving: false,
  }));
  const latestStateRef = useRef(state);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    const stored = readStoredLike(carId);
    const nextState = {
      count: coerceCount(initialCount),
      liked: stored?.liked ?? coerceLiked(initialLiked),
      saving: false,
    };
    setState(nextState);
    latestStateRef.current = nextState;
  }, [carId, initialCount, initialLiked]);

  const setLike = useCallback(
    async (nextLiked) => {
      if (!carId) return;
      const previous = latestStateRef.current;
      const desired = Boolean(nextLiked);
      if (!desired) {
        // Frontend no longer allows removing likes; ignore requests to unlike.
        if (previous.liked) {
          const settled = { ...previous, saving: false };
          setState(settled);
          latestStateRef.current = settled;
        }
        return;
      }
      const optimistic = {
        count: Math.max(0, previous.count + 1),
        liked: true,
        saving: true,
      };
      setState(optimistic);
      latestStateRef.current = optimistic;
      writeStoredLike(carId, true);
      try {
        const payload = await setCarLike(carId, true);
        const resolved = {
          count: coerceCount(payload?.count ?? optimistic.count),
          liked: coerceLiked(payload?.liked ?? true),
          saving: false,
        };
        setState(resolved);
        latestStateRef.current = resolved;
        writeStoredLike(carId, resolved.liked);
      } catch (error) {
        const reverted = {
          count: previous.count,
          liked: previous.liked,
          saving: false,
        };
        setState(reverted);
        latestStateRef.current = reverted;
        writeStoredLike(carId, previous.liked);
        if (typeof onError === "function") {
          onError(error, true);
        }
        throw error;
      }
    },
    [carId, onError],
  );

  const addLike = useCallback(() => {
    const latest = latestStateRef.current;
    setLike(true);
  }, [setLike]);

  return {
    count: state.count,
    liked: state.liked,
    saving: state.saving,
    setLike,
    addLike,
  };
}
