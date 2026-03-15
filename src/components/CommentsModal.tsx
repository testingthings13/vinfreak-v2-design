import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, RefreshCw, MessageCircle } from "lucide-react";
import { getComments, submitComment, reactToComment } from "@/lib/api";
import { toast } from "sonner";

// ── Helpers ──

const DATE_FORMAT = (() => {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return null;
  }
})();

function formatTimestamp(value?: string | null) {
  if (!value) return "Just now";
  try {
    if (DATE_FORMAT) return DATE_FORMAT.format(new Date(value));
  } catch {}
  return value;
}

function getTimestamp(value?: string | null) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

interface RawComment {
  id: string | number;
  body?: string;
  display_name?: string;
  author?: string;
  created_at?: string;
  automation_source?: string | null;
  reactions?: { total?: number; counts?: Record<string, number> };
  replies?: RawComment[];
  reply_count?: number;
  [key: string]: any;
}

interface NormalizedComment extends RawComment {
  reactions: { total: number; counts: Record<string, number> };
  replies: NormalizedComment[];
  reactionAnimationKey: number;
  lastReactionType: string | null;
}

function normalizeComments(list: any[]): NormalizedComment[] {
  if (!Array.isArray(list)) return [];
  return [...list]
    .map((c) => ({
      ...c,
      reactionAnimationKey: 0,
      lastReactionType: null,
      reactions: c?.reactions && typeof c.reactions === "object"
        ? c.reactions
        : { total: 0, counts: {} },
      replies: normalizeComments(c?.replies || []),
    }))
    .sort((a, b) => getTimestamp(a?.created_at) - getTimestamp(b?.created_at));
}

function updateReactionInTree(
  list: NormalizedComment[],
  commentId: string | number,
  summary: any,
  meta: { triggeredReaction?: string; animationKey?: number } = {}
): [NormalizedComment[], boolean] {
  let changed = false;
  const next = list.map((c) => {
    if (c.id === commentId) {
      changed = true;
      return { ...c, reactions: summary, reactionAnimationKey: meta.animationKey || Date.now(), lastReactionType: meta.triggeredReaction || null };
    }
    if (c.replies.length > 0) {
      const [updated, rc] = updateReactionInTree(c.replies, commentId, summary, meta);
      if (rc) { changed = true; return { ...c, replies: updated }; }
    }
    return c;
  });
  return [changed ? next : list, changed];
}

// ── Component ──

interface CommentsModalProps {
  carId: string;
  carTitle?: string;
  carImage?: string;
  onClose: () => void;
  onCommentApproved?: () => void;
  refreshCount?: () => void;
}

export default function CommentsModal({
  carId,
  carTitle,
  carImage,
  onClose,
  onCommentApproved,
  refreshCount,
}: CommentsModalProps) {
  const [comments, setComments] = useState<NormalizedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: string; message: string } | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [pendingReactionId, setPendingReactionId] = useState<string | number | null>(null);
  const [activeReplyId, setActiveReplyId] = useState<string | number | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string | number>>(() => new Set());

  const commentBodyId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalTitleId = `comments-modal-title-${carId}`;

  // ── Fetch ──
  const fetchComments = useCallback(async (silent = false) => {
    if (!carId) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const payload = await getComments(carId);
      const list = normalizeComments(payload?.comments || (Array.isArray(payload) ? payload : []));
      setComments(list);
      setExpandedReplies(new Set());
    } catch (err: any) {
      setError(err?.message || "Unable to load comments.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [carId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  // ── Lock scroll ──
  useEffect(() => {
    document.documentElement.classList.add("overflow-hidden");
    document.body.classList.add("overflow-hidden");
    return () => {
      document.body.classList.remove("overflow-hidden");
      document.documentElement.classList.remove("overflow-hidden");
    };
  }, []);

  // ── Escape key ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Focus close button ──
  useEffect(() => { closeButtonRef.current?.focus({ preventScroll: true }); }, []);

  // ── Backdrop click ──
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  // ── Submit comment ──
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!carId || submitting) return;
    const trimmed = commentBody.trim();
    if (!trimmed) {
      setIsComposeOpen(true);
      setNotice({ tone: "error", message: "Share a thought before submitting." });
      return;
    }
    if (trimmed.length > 2000) {
      setNotice({ tone: "error", message: "Comment must be under 2000 characters." });
      return;
    }
    try {
      setSubmitting(true);
      setNotice(null);
      const response = await submitComment(carId, { text: trimmed });
      const status = response?.status || "approved";
      if (status === "approved" && response?.comment) {
        await fetchComments(true);
        setCommentBody("");
        setNotice({ tone: "success", message: response?.message || "Comment posted!" });
        setIsComposeOpen(false);
        onCommentApproved?.();
        refreshCount?.();
      } else {
        setCommentBody("");
        setNotice({ tone: "info", message: response?.message || "Your comment is waiting for moderation." });
        setIsComposeOpen(false);
        refreshCount?.();
      }
    } catch (err: any) {
      const message = err?.message || "Unable to submit comment.";
      setIsComposeOpen(true);
      setNotice({ tone: "error", message });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [carId, submitting, commentBody, fetchComments, onCommentApproved, refreshCount]);

  // ── Reaction ──
  const handleReaction = useCallback(async (commentId: string | number) => {
    if (!commentId || pendingReactionId) return;
    try {
      setPendingReactionId(commentId);
      const response = await reactToComment(String(commentId), "like");
      const summary = response?.reactions;
      if (summary) {
        setComments((prev) => {
          const [updated, changed] = updateReactionInTree(prev, commentId, summary, { triggeredReaction: "like", animationKey: Date.now() });
          return changed ? updated : prev;
        });
      } else {
        await fetchComments(true);
      }
    } catch (err: any) {
      toast.error(err?.message || "Unable to update reaction.");
    } finally {
      setPendingReactionId(null);
    }
  }, [pendingReactionId, fetchComments]);

  // ── Reply ──
  const handleReplySubmit = useCallback(async (e: React.FormEvent, commentId: string | number) => {
    e.preventDefault();
    if (!carId || replySubmitting) return;
    const text = (replyDrafts[String(commentId)] || "").trim();
    if (!text) { toast.error("Share a reply before submitting."); return; }
    if (text.length > 2000) { toast.error("Reply must be under 2000 characters."); return; }
    try {
      setReplySubmitting(true);
      const response = await submitComment(carId, { text, parent_id: String(commentId) });
      const status = response?.status || "approved";
      if (status === "approved" && response?.comment) {
        await fetchComments(true);
        toast.success(response?.message || "Reply posted!");
      } else {
        toast.info(response?.message || "Your reply is waiting for moderation.");
      }
      setReplyDrafts((prev) => ({ ...prev, [String(commentId)]: "" }));
      setActiveReplyId(null);
      refreshCount?.();
    } catch (err: any) {
      toast.error(err?.message || "Unable to submit reply.");
    } finally {
      setReplySubmitting(false);
    }
  }, [carId, replySubmitting, replyDrafts, fetchComments, refreshCount]);

  // ── Comment list ──
  const commentList = useMemo(() =>
    comments.map((c) => ({
      ...c,
      displayTime: formatTimestamp(c.created_at),
      displayName: c.display_name || c.author || "Anonymous",
      replies: c.replies.map((r) => ({
        ...r,
        displayTime: formatTimestamp(r.created_at),
        displayName: r.display_name || (r as any).author || "Anonymous",
      })),
    }))
  , [comments]);

  // ── Render a single comment ──
  const renderComment = (comment: any, depth = 0) => {
    if (!comment) return null;
    const isReplying = activeReplyId === comment.id;
    const replyValue = replyDrafts[String(comment.id)] || "";
    const replyList = Array.isArray(comment.replies) ? comment.replies : [];
    const hasReplies = replyList.length > 0;
    const replyKey = comment.id;
    const isExpanded = expandedReplies.has(replyKey);
    const visibleReplies = isExpanded ? replyList : [];
    const replyCount = comment.reply_count ?? replyList.length;
    const toggleLabel = isExpanded ? "Hide replies" : replyCount === 1 ? "View 1 reply" : `View ${replyCount} replies`;
    const totalReactions = Number(comment?.reactions?.total || 0);

    return (
      <article
        key={comment.id}
        className={`py-3 ${depth > 0 ? "ml-6 border-l border-border pl-4" : "border-b border-border"}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm text-foreground">{comment.displayName}</span>
          {comment.automation_source === "gpt_commenter" && (
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">AI</span>
          )}
          <time className="text-xs text-muted-foreground ml-auto">{comment.displayTime}</time>
        </div>
        <div className="text-sm text-foreground/90 whitespace-pre-wrap">
          {String(comment.body || "").split(/\n+/).map((line: string, i: number) => (
            <p key={i} className={i > 0 ? "mt-1" : ""}>{line}</p>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setActiveReplyId(isReplying ? null : comment.id)}
          >
            {isReplying ? "Cancel" : "Reply"}
          </button>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            onClick={() => handleReaction(comment.id)}
            disabled={pendingReactionId === comment.id}
          >
            <span>👍</span>
            {totalReactions > 0 && <span>{totalReactions}</span>}
          </button>
        </div>

        {isReplying && (
          <form className="mt-3" onSubmit={(e) => handleReplySubmit(e, comment.id)}>
            <textarea
              value={replyValue}
              onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [String(comment.id)]: e.target.value }))}
              rows={2}
              maxLength={2000}
              placeholder="Share your thoughts…"
              required
              className="w-full rounded-lg border border-border bg-background text-sm px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="flex gap-2 mt-2">
              <button type="submit" disabled={replySubmitting} className="text-xs font-semibold bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 disabled:opacity-50">
                {replySubmitting ? "Posting…" : "Post reply"}
              </button>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setActiveReplyId(null)}>
                Close
              </button>
            </div>
          </form>
        )}

        {hasReplies && (
          <div className="mt-2">
            {visibleReplies.map((reply: any) => renderComment(reply, depth + 1))}
            <button
              type="button"
              className="text-xs text-primary hover:text-primary/80 font-medium mt-1"
              onClick={() => setExpandedReplies((prev) => {
                const next = new Set(prev);
                next.has(replyKey) ? next.delete(replyKey) : next.add(replyKey);
                return next;
              })}
            >
              {toggleLabel}
            </button>
          </div>
        )}
      </article>
    );
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      ref={backdropRef}
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalTitleId}
      >
        {/* Header */}
        <header className="flex items-center gap-3 p-4 border-b border-border flex-shrink-0">
          {carImage && (
            <img src={carImage} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Community Comments</p>
            <h2 id={modalTitleId} className="text-sm font-bold text-foreground truncate">{carTitle || "Listing"}</h2>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => fetchComments()}
              disabled={loading}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Refresh comments"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              ref={closeButtonRef}
              onClick={onClose}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Close comments"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4">
          {error && <div className="text-destructive text-sm py-3">{error}</div>}

          {loading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading comments…</div>
          ) : commentList.length === 0 ? (
            <div className="py-12 text-center">
              <MessageCircle className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-muted-foreground text-sm">Be the first to share a take on this ride.</p>
            </div>
          ) : (
            <div>{commentList.map((c) => renderComment(c))}</div>
          )}
        </div>

        {/* Compose */}
        <div className="p-4 border-t border-border flex-shrink-0">
          {notice && (
            <div className={`text-xs mb-2 px-3 py-2 rounded-lg ${
              notice.tone === "error" ? "bg-destructive/10 text-destructive" :
              notice.tone === "success" ? "bg-green-500/10 text-green-500" :
              "bg-primary/10 text-primary"
            }`}>
              {notice.message}
            </div>
          )}
          {isComposeOpen ? (
            <form onSubmit={handleSubmit}>
              <textarea
                id={commentBodyId}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="What stood out about this build?"
                required
                className="w-full rounded-lg border border-border bg-background text-sm px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <div className="flex gap-2 mt-2">
                <button type="submit" disabled={submitting} className="text-sm font-semibold bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {submitting ? "Posting…" : "Post comment"}
                </button>
                <button type="button" onClick={() => { setIsComposeOpen(false); setNotice(null); }} className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsComposeOpen(true)}
              className="w-full text-sm font-semibold bg-primary text-primary-foreground px-4 py-2.5 rounded-lg hover:bg-primary/90 transition-colors"
            >
              Comment
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
