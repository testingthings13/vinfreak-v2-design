import { useWouldYouBuy, PollVote } from "@/hooks/useWouldYouBuy";
import { motion, AnimatePresence } from "framer-motion";
import { ThumbsUp, ThumbsDown, Minus } from "lucide-react";

interface Props {
  carId: string | null;
}

const options: { value: PollVote; label: string; icon: typeof ThumbsUp; emoji: string }[] = [
  { value: "yes", label: "Yes!", icon: ThumbsUp, emoji: "🔥" },
  { value: "no", label: "Nope", icon: ThumbsDown, emoji: "👎" },
  { value: "maybe", label: "Maybe", icon: Minus, emoji: "🤔" },
];

export default function WouldYouBuyPoll({ carId }: Props) {
  const { userVote, counts, totalVotes, vote, hasVoted } = useWouldYouBuy(carId);

  if (!carId) return null;

  const getPercent = (v: PollVote) =>
    totalVotes > 0 ? Math.round((counts[v] / totalVotes) * 100) : 0;

  return (
    <div className="wyb-poll">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
        Would You Buy?
      </p>

      <AnimatePresence mode="wait">
        {!hasVoted ? (
          <motion.div
            key="buttons"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-3 gap-2"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => vote(opt.value)}
                className="wyb-vote-btn"
              >
                <span className="text-base">{opt.emoji}</span>
                <span className="text-[11px] font-semibold">{opt.label}</span>
              </button>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            {options.map((opt) => {
              const pct = getPercent(opt.value);
              const isChosen = userVote === opt.value;
              return (
                <div key={opt.value} className="wyb-result-row">
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className={`font-medium ${isChosen ? "text-primary" : "text-muted-foreground"}`}>
                      {opt.emoji} {opt.label} {isChosen && "✓"}
                    </span>
                    <span className="font-bold text-foreground">{pct}%</span>
                  </div>
                  <div className="wyb-bar-track">
                    <motion.div
                      className={`wyb-bar-fill ${opt.value === "yes" ? "wyb-bar--yes" : opt.value === "no" ? "wyb-bar--no" : "wyb-bar--maybe"}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground text-center mt-1">
              {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
