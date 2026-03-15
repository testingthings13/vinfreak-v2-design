import { useEffect, useState } from "react";
import { resolveTarget } from "../utils/time";

export default function CountdownTimer({ endTime, timeLeft }) {
  const [remaining, setRemaining] = useState(() => {
    const target = resolveTarget(endTime, timeLeft);
    return isNaN(target) ? 0 : Math.max(0, target - Date.now());
  });

  useEffect(() => {
    const target = resolveTarget(endTime, timeLeft);
    if (isNaN(target)) {
      setRemaining(0);
      return;
    }
    let id;
    const update = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setRemaining(0);
        clearInterval(id);
      } else {
        setRemaining(diff);
      }
    };
    update();
    id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endTime, timeLeft]);

  if (!endTime && !timeLeft) return null;

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days >= 2) {
    parts.push(`${days}d`);
    parts.push(`${hours}h`);
  } else if (days >= 1) {
    parts.push(`${days}d`);
    parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
  } else if (hours >= 1) {
    parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
  } else {
    parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
  }

  const urgent = remaining <= 2 * 3600 * 1000;
  return <span className={`countdown${urgent ? " urgent" : ""}`}>{parts.join(" ")}</span>;
}

