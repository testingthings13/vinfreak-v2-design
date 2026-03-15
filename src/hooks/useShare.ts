import { useCallback, useState, useRef } from "react";
import { toast } from "sonner";

export function useShare() {
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">("idle");
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleReset = useCallback(() => {
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => {
      setShareState("idle");
      resetRef.current = null;
    }, 3200);
  }, []);

  const handleShare = useCallback(async (url: string, title?: string) => {
    if (!url) {
      toast.error("Share link unavailable");
      return;
    }

    try {
      // Try native share (mobile)
      if (navigator?.share) {
        await navigator.share({ url, title });
        setShareState("shared");
        toast.success("Shared successfully!");
        scheduleReset();
        return;
      }

      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(url);
      setShareState("copied");
      toast.success("Share link copied!");
      scheduleReset();
    } catch (e: any) {
      if (e?.name === "AbortError") {
        setShareState("idle");
        return;
      }
      // If share was denied, try clipboard
      try {
        await navigator.clipboard.writeText(url);
        setShareState("copied");
        toast.success("Share link copied!");
        scheduleReset();
      } catch {
        toast.error("Unable to share right now");
        setShareState("idle");
      }
    }
  }, [scheduleReset]);

  return { shareState, handleShare };
}
