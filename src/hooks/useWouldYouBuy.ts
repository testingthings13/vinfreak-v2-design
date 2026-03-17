import { useState, useCallback, useEffect } from "react";
import { getFingerprint } from "@/lib/fingerprint";

export type PollVote = "yes" | "no" | "maybe";

interface PollState {
  yes: number;
  no: number;
  maybe: number;
}

const STORAGE_KEY = "vf_wyb_votes";

function getVoteStore(): Record<string, PollVote> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function getPollStore(): Record<string, PollState> {
  try {
    return JSON.parse(localStorage.getItem("vf_wyb_polls") || "{}");
  } catch {
    return {};
  }
}

function savePollStore(store: Record<string, PollState>) {
  localStorage.setItem("vf_wyb_polls", JSON.stringify(store));
}

export function useWouldYouBuy(carId: string | null) {
  const fp = getFingerprint();
  const voteKey = carId ? `${carId}:${fp}` : "";

  const [userVote, setUserVote] = useState<PollVote | null>(null);
  const [counts, setCounts] = useState<PollState>({ yes: 0, no: 0, maybe: 0 });

  useEffect(() => {
    if (!carId) return;
    const store = getVoteStore();
    setUserVote(store[voteKey] || null);

    const polls = getPollStore();
    if (polls[carId]) setCounts(polls[carId]);
  }, [carId, voteKey]);

  const totalVotes = counts.yes + counts.no + counts.maybe;

  const vote = useCallback(
    (choice: PollVote) => {
      if (!carId || userVote) return;

      // Save vote
      const store = getVoteStore();
      store[voteKey] = choice;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      setUserVote(choice);

      // Update counts
      const polls = getPollStore();
      const current = polls[carId] || { yes: 0, no: 0, maybe: 0 };
      current[choice]++;
      polls[carId] = current;
      savePollStore(polls);
      setCounts({ ...current });
    },
    [carId, voteKey, userVote]
  );

  return { userVote, counts, totalVotes, vote, hasVoted: !!userVote };
}
