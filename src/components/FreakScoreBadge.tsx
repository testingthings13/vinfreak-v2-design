import { NormalizedCar } from "@/lib/normalizeCar";
import { computeFreakScore, getScoreLabel, getScoreColor } from "@/lib/freakScore";
import { Zap } from "lucide-react";

interface Props {
  car: NormalizedCar;
  size?: "sm" | "md";
}

export default function FreakScoreBadge({ car, size = "sm" }: Props) {
  const score = computeFreakScore(car);
  if (score == null) return null;

  const colorClass = getScoreColor(score);

  if (size === "sm") {
    return (
      <span className={`freak-score-badge ${colorClass}`} title={`FREAK Score: ${score} — ${getScoreLabel(score)}`}>
        <Zap className="w-3 h-3" />
        <span className="font-bold">{score}</span>
      </span>
    );
  }

  return (
    <div className={`freak-score-badge-lg ${colorClass}`}>
      <div className="flex items-center gap-1.5">
        <Zap className="w-4 h-4" />
        <span className="text-2xl font-black">{score}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">/100</span>
      </div>
      <span className="text-[11px] font-semibold">{getScoreLabel(score)}</span>
    </div>
  );
}
