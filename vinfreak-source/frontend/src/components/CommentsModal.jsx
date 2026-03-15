import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import commentCarVisual from "../assets/comments-car.svg";
import { API_BASE, getComments, submitComment, reactToComment } from "../api";
import { useToast } from "../ToastContext";
import FreakStatsIcon from "../assets/freakstats.svg";
import { SettingsContext } from "../App";

const DATE_FORMAT = (() => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch (error) {
    return null;
  }
})();

function formatTimestamp(value) {
  if (!value) return "Just now";
  try {
    if (DATE_FORMAT) {
      return DATE_FORMAT.format(new Date(value));
    }
  } catch (error) {
    return value;
  }
  return value;
}

const REACTIONS = [{ type: "like", label: "Like", emoji: "👍" }];
const PRIMARY_REACTION = REACTIONS[0] || { type: "like", label: "Like", emoji: "👍" };

function getTimestamp(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeComments(list) {
  if (!Array.isArray(list)) return [];
  return [...list]
    .map((comment) => ({
      ...comment,
      reactionAnimationKey: comment?.reactionAnimationKey || 0,
      lastReactionType: comment?.lastReactionType || null,
      reactions: comment?.reactions && typeof comment.reactions === "object"
        ? comment.reactions
        : { total: 0, counts: {} },
      replies: normalizeComments(comment?.replies || []),
    }))
    .sort((a, b) => getTimestamp(a?.created_at) - getTimestamp(b?.created_at));
}

function enhanceComment(comment) {
  const counts = comment?.reactions?.counts || {};
  const automationSource = comment?.automation_source || null;
  const isAutomated = automationSource === "gpt_commenter";
  return {
    ...comment,
    automation_source: automationSource,
    isAutomated,
    displayTime: formatTimestamp(comment.created_at),
    reactionSummary: REACTIONS.map((reaction) => ({
      ...reaction,
      count: Number(counts[reaction.type] || 0),
    })),
    replies: Array.isArray(comment?.replies)
      ? comment.replies.map((reply) => enhanceComment(reply))
      : [],
  };
}

function updateCommentReactionSummary(list, commentId, summary, meta = {}) {
  let changed = false;
  const next = list.map((comment) => {
    if (comment?.id === commentId) {
      changed = true;
      return {
        ...comment,
        reactions: summary,
        reactionAnimationKey: meta?.animationKey || Date.now(),
        lastReactionType: meta?.triggeredReaction || null,
      };
    }
    if (Array.isArray(comment?.replies) && comment.replies.length > 0) {
      const [updatedReplies, replyChanged] = updateCommentReactionSummary(
        comment.replies,
        commentId,
        summary,
        meta
      );
      if (replyChanged) {
        changed = true;
        return {
          ...comment,
          replies: updatedReplies,
        };
      }
    }
    return comment;
  });
  return [changed ? next : list, changed];
}

export default function CommentsModal({
  carId,
  carTitle,
  carImage,
  carMetaValue,
  onClose,
  onCommentApproved,
  refreshCount,
}) {
  const { addToast } = useToast();
  const settings = useContext(SettingsContext);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [commentBody, setCommentBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [pendingReactionId, setPendingReactionId] = useState(null);
  const [activeReplyId, setActiveReplyId] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState(() => new Set());
  const [expandedReactionBars, setExpandedReactionBars] = useState(() => new Set());
  const commentBodyId = useId();
  const backdropRef = useRef(null);
  const closeButtonRef = useRef(null);
  const modalTitleId = useMemo(() => `comments-modal-title-${carId || "listing"}`, [carId]);
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  const visualSource = carImage || commentCarVisual;
  const hasPhoto = Boolean(carImage);

  const fetchComments = useCallback(
    async (options = {}) => {
      if (!carId) return;
      const silent = Boolean(options?.silent);
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const payload = await getComments(carId);
        const list = normalizeComments(payload?.comments);
        setComments(list);
        setExpandedReplies(new Set());
        setExpandedReactionBars(new Set());
      } catch (err) {
        setError(err?.message || "Unable to load comments.");
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [carId]
  );

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const body = document.body;
    if (root) {
      root.classList.add("modal-open");
    }
    if (body) {
      body.classList.add("modal-open");
    }
    return () => {
      if (body) {
        body.classList.remove("modal-open");
      }
      if (root) {
        root.classList.remove("modal-open");
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (typeof onClose === "function") {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (closeButtonRef.current) {
      closeButtonRef.current.focus({ preventScroll: true });
    }
  }, []);

  const handleBackdropClick = useCallback(
    (event) => {
      if (event.target !== event.currentTarget) return;
      if (typeof onClose === "function") {
        onClose();
      }
    },
    [onClose]
  );

  const handleBodyChange = useCallback((event) => {
    setCommentBody(event.target.value);
  }, []);

  const handleRepliesVisibilityToggle = useCallback((commentKey) => {
    if (!commentKey) return;
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(commentKey)) {
        next.delete(commentKey);
      } else {
        next.add(commentKey);
      }
      return next;
    });
  }, []);

  const handleReactionToggle = useCallback((commentKey) => {
    if (!commentKey) return;
    setExpandedReactionBars((prev) => {
      const next = new Set(prev);
      if (next.has(commentKey)) {
        next.delete(commentKey);
      } else {
        next.add(commentKey);
      }
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!carId || submitting) {
        return;
      }
      const trimmedBody = (commentBody || "").trim();
      if (!trimmedBody) {
        setIsComposeOpen(true);
        setNotice({ tone: "error", message: "Share a thought before submitting." });
        return;
      }

      const payload = {
        body: commentBody,
      };

      try {
        setSubmitting(true);
        setNotice(null);
        const response = await submitComment(carId, payload);
        const status = response?.status || "approved";
        if (status === "approved" && response?.comment) {
          await fetchComments({ silent: true });
          setCommentBody("");
          setNotice({ tone: "success", message: response?.message || "Comment posted!" });
          setIsComposeOpen(false);
          if (typeof onCommentApproved === "function") {
            onCommentApproved();
          }
          if (typeof refreshCount === "function") {
            refreshCount();
          }
        } else {
          setCommentBody("");
          setNotice({ tone: "info", message: response?.message || "Your comment is waiting for moderation." });
          setIsComposeOpen(false);
          if (typeof refreshCount === "function") {
            refreshCount();
          }
        }
      } catch (err) {
        const message = err?.message || "Unable to submit comment.";
        setIsComposeOpen(true);
        setNotice({ tone: "error", message });
        addToast(message, "error");
      } finally {
        setSubmitting(false);
      }
    },
    [carId, submitting, commentBody, fetchComments, onCommentApproved, refreshCount, addToast]
  );

  const handleComposeOpen = useCallback(() => {
    setIsComposeOpen(true);
  }, []);

  const handleComposeClose = useCallback(() => {
    setIsComposeOpen(false);
    setNotice(null);
  }, []);

  const handleRefresh = useCallback(() => {
    fetchComments();
  }, [fetchComments]);

  const handleReaction = useCallback(
    async (commentId, reaction) => {
      if (!commentId || pendingReactionId) return;
      try {
        setPendingReactionId(commentId);
        const response = await reactToComment(commentId, { reaction });
        const summary = response?.reactions;
        if (summary) {
          setComments((prev) => {
            const animationMeta = {
              triggeredReaction: reaction,
              animationKey: Date.now(),
            };
            const [updated, changed] = updateCommentReactionSummary(
              prev,
              commentId,
              summary,
              animationMeta
            );
            if (changed) {
              return updated;
            }
            return prev;
          });
        } else {
          await fetchComments({ silent: true });
        }
      } catch (err) {
        const message = err?.message || "Unable to update reaction.";
        addToast(message, "error");
      } finally {
        setPendingReactionId(null);
      }
    },
    [pendingReactionId, fetchComments, addToast]
  );

  const handleReplyToggle = useCallback((commentId) => {
    setActiveReplyId((prev) => (prev === commentId ? null : commentId));
  }, []);

  const handleReplyChange = useCallback((commentId, value) => {
    setReplyDrafts((prev) => ({ ...prev, [commentId]: value }));
  }, []);

  const handleReplySubmit = useCallback(
    async (event, commentId) => {
      event.preventDefault();
      if (!carId || replySubmitting) {
        return;
      }
      const text = (replyDrafts[commentId] || "").trim();
      if (!text) {
        addToast("Share a reply before submitting.", "error");
        return;
      }
      const payload = {
        body: text,
        parentId: commentId,
      };
      try {
        setReplySubmitting(true);
        const response = await submitComment(carId, payload);
        const status = response?.status || "approved";
        if (status === "approved" && response?.comment) {
          await fetchComments({ silent: true });
          addToast(response?.message || "Reply posted!", "success");
        } else {
          addToast(response?.message || "Your reply is waiting for moderation.", "info");
        }
        setReplyDrafts((prev) => ({ ...prev, [commentId]: "" }));
        setActiveReplyId(null);
        if (typeof refreshCount === "function") {
          refreshCount();
        }
      } catch (err) {
        const message = err?.message || "Unable to submit reply.";
        addToast(message, "error");
      } finally {
        setReplySubmitting(false);
      }
    },
    [carId, replySubmitting, replyDrafts, fetchComments, addToast, refreshCount]
  );

  const commentList = useMemo(() => {
    if (!comments?.length) return [];
    return comments.map((comment) => enhanceComment(comment));
  }, [comments]);

  const configuredIconSrc = useMemo(() => {
    const raw = settings?.freakstats_icon_url;
    if (!raw) return FreakStatsIcon;
    const trimmed = String(raw).trim();
    if (!trimmed) return FreakStatsIcon;
    if (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("data:") ||
      trimmed.startsWith("blob:")
    ) {
      return trimmed;
    }
    if (trimmed.startsWith("/")) {
      return `${API_BASE}${trimmed}`;
    }
    return `${API_BASE}/${trimmed}`;
  }, [settings?.freakstats_icon_url]);

  const iconStyle = useMemo(() => {
    const style = {};
    const widthValue = Number(settings?.freakstats_icon_width);
    const heightValue = Number(settings?.freakstats_icon_height);
    if (Number.isFinite(widthValue) && widthValue > 0) {
      style.width = `${widthValue}px`;
    }
    if (Number.isFinite(heightValue) && heightValue > 0) {
      style.height = `${heightValue}px`;
    }
    if (style.width || style.height) {
      style.objectFit = "contain";
      style.flexShrink = 0;
    }
    return Object.keys(style).length ? style : undefined;
  }, [settings?.freakstats_icon_height, settings?.freakstats_icon_width]);

  const renderComment = (comment, depth = 0) => {
    if (!comment) return null;
    const replyValue = replyDrafts[comment.id] || "";
    const isReplying = activeReplyId === comment.id;
    const replyList = Array.isArray(comment.replies) ? comment.replies : [];
    const replyTotal = typeof comment.reply_count === "number"
      ? comment.reply_count
      : replyList.length;
    const replyStateKey = comment?.id ?? comment?.created_at ?? null;
    const reactionStateKey = replyStateKey;
    const hasReplies = replyList.length > 0;
    const isExpanded = !replyStateKey ? true : expandedReplies.has(replyStateKey);
    const visibleReplies = isExpanded ? replyList : [];
    const replyLabelCount = replyTotal || replyList.length;
    const toggleLabel = isExpanded
      ? "Hide replies"
      : replyLabelCount === 1
        ? "View 1 reply"
        : `View ${replyLabelCount} replies`;
    const isReactionBarExpanded = reactionStateKey
      ? expandedReactionBars.has(reactionStateKey)
      : false;
    const totalReactions = Number(comment?.reactions?.total || 0);
    const reactionBarId = reactionStateKey ? `comment-${reactionStateKey}-reactions` : undefined;
    const hasMultipleReactions = REACTIONS.length > 1;
    const primaryReaction = PRIMARY_REACTION;
    const isReacting = pendingReactionId === comment.id;
    const itemClasses = ["comments-feed-item"];
    if (depth > 0) {
      itemClasses.push("comments-feed-item--nested");
    }
    const showAutomatedIcon = comment.isAutomated && configuredIconSrc;
    const authorClasses = ["comments-feed-item__name"];
    if (comment.isAutomated) {
      authorClasses.push("comments-feed-item__name--automated");
    }

    return (
      <article
        key={comment.id || comment.created_at}
        className={itemClasses.join(" ")}
      >
        <header className="comments-feed-item__header">
          <div className="comments-feed-item__meta">
            <div className="comments-feed-item__meta-row">
              <div className="comments-feed-item__author">
                <h3 className={authorClasses.join(" ")}>{comment.display_name}</h3>
                {showAutomatedIcon ? (
                  <span className="comments-feed-item__name-icon" aria-hidden="true">
                    <img
                      src={configuredIconSrc}
                      alt=""
                      className="freakstats-modal-title__icon"
                      style={iconStyle}
                    />
                  </span>
                ) : null}
              </div>
              <div className="comments-feed-item__meta-aside">
                <time
                  className="comments-feed-item__timestamp muted"
                  dateTime={comment?.created_at || undefined}
                >
                  {comment.displayTime}
                </time>
              </div>
            </div>
          </div>
        </header>
        <div className="comments-feed-item__body">
          {String(comment.body || "").split(/\n+/).map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
        <footer className="comments-feed-item__footer">
          {hasMultipleReactions && isReactionBarExpanded && (
            <div
              className="comment-reaction-bar"
              role="group"
              aria-label="Comment reactions"
              id={reactionBarId}
            >
              {comment.reactionSummary.map((reaction) => {
                const shouldBurst =
                  comment.lastReactionType === reaction.type && comment.reactionAnimationKey;
                const buttonClasses = ["comment-reaction-button"];
                if (reaction.count > 0) {
                  buttonClasses.push("comment-reaction-button--active");
                }
                if (shouldBurst) {
                  buttonClasses.push("comment-reaction-button--burst");
                }
                return (
                  <button
                    key={`${comment.id}-${reaction.type}-${comment.reactionAnimationKey || 0}`}
                    type="button"
                    className={buttonClasses.join(" ")}
                    onClick={() => handleReaction(comment.id, reaction.type)}
                    disabled={pendingReactionId === comment.id}
                    aria-label={`${reaction.label} reaction (${reaction.count})`}
                    title={`${reaction.label} · ${reaction.count}`}
                  >
                    <span aria-hidden="true" className="comment-reaction-ripple" />
                    <span aria-hidden="true" className="comment-reaction-emoji">{reaction.emoji}</span>
                    <span className="comment-reaction-count">{reaction.count}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="comment-action-row">
            <button
              type="button"
              className="btn ghost comment-reply-trigger"
              onClick={() => handleReplyToggle(comment.id)}
            >
              {isReplying ? "Cancel" : "Reply"}
            </button>
            <button
              type="button"
              className="comment-react-trigger"
              onClick={() => {
                if (hasMultipleReactions) {
                  handleReactionToggle(reactionStateKey);
                } else if (primaryReaction?.type) {
                  handleReaction(comment.id, primaryReaction.type);
                }
              }}
              aria-expanded={hasMultipleReactions ? isReactionBarExpanded : undefined}
              aria-controls={hasMultipleReactions ? reactionBarId : undefined}
              disabled={!hasMultipleReactions && isReacting}
            >
              <span aria-hidden="true" className="comment-react-trigger__emoji">
                {primaryReaction?.emoji || "👍"}
              </span>
              <span className="sr-only">
                {hasMultipleReactions
                  ? "React"
                  : `${primaryReaction?.label || "Like"} this comment`}
              </span>
              {totalReactions > 0 && (
                <span className="comment-react-trigger__count" aria-hidden="true">
                  {totalReactions}
                </span>
              )}
            </button>
          </div>
        </footer>
        {isReplying && (
          <form className="comment-reply-form" onSubmit={(event) => handleReplySubmit(event, comment.id)}>
            <label className="muted small" htmlFor={`reply-${comment.id}`}>
              Your reply
            </label>
            <textarea
              id={`reply-${comment.id}`}
              value={replyValue}
              onChange={(event) => handleReplyChange(comment.id, event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Share your thoughts"
              required
            />
            <div className="comments-form__actions">
              <button type="submit" className="btn primary" disabled={replySubmitting}>
                {replySubmitting ? "Posting…" : "Post reply"}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => handleReplyToggle(comment.id)}
              >
                Close
              </button>
            </div>
            <p className="muted small">Replies reuse the name &amp; email entered above.</p>
          </form>
        )}
        {hasReplies && (
          <div className="comments-feed-replies">
            {visibleReplies.map((reply) => renderComment(reply, depth + 1))}
            {replyStateKey && (
              <button
                type="button"
                className="comment-replies-toggle"
                onClick={() => handleRepliesVisibilityToggle(replyStateKey)}
                aria-expanded={isExpanded}
              >
                {toggleLabel}
              </button>
            )}
          </div>
        )}
      </article>
    );
  };

  const headingTitle = carTitle || "Listing";
  const subtitle = carMetaValue || null;

  const modalContent = (
    <div
      className="modal-backdrop"
      role="presentation"
      ref={backdropRef}
      onClick={handleBackdropClick}
    >
      <div className="modal-panel comments-modal" role="dialog" aria-modal="true" aria-labelledby={modalTitleId}>
        <header className="modal-header comments-modal-header">
          <div className="comments-modal-title">
            <span className={`comments-modal-visual${hasPhoto ? " comments-modal-visual--photo" : ""}`}>
              <img src={visualSource} alt={hasPhoto ? headingTitle : ""} loading="lazy" />
            </span>
            <div className="comments-modal-title-text">
              <span className="comments-modal-eyebrow">Community Comments</span>
              <div className="comments-modal-title-heading">
                <h2 id={modalTitleId}>{headingTitle}</h2>
                {subtitle && <span className="comments-modal-subtitle">{subtitle}</span>}
              </div>
            </div>
          </div>
          <div className="modal-header-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={handleRefresh}
              disabled={loading}
            >
              Refresh
            </button>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              ref={closeButtonRef}
              aria-label="Close comments"
            >
              ×
            </button>
          </div>
        </header>
        <div className="modal-body comments-modal-body">
          {error && <div className="modal-error" role="status">{error}</div>}
          <div className="comments-modal-frame">
            <div className="comments-modal-grid">
              <section className="comments-feed" aria-live="polite">
                {loading ? (
                  <div className="comments-empty">Loading comments…</div>
                ) : commentList.length === 0 ? (
                  <div className="comments-empty">Be the first to share a take on this ride.</div>
                ) : (
                  commentList.map((comment) => renderComment(comment))
                )}
              </section>
              <section className="comments-compose">
                {notice && (
                  <div className={`comments-notice comments-notice--${notice.tone || "info"}`} role="status">
                    {notice.message}
                  </div>
                )}
                {isComposeOpen ? (
                  <form className="comments-form" onSubmit={handleSubmit}>
                    <div className="comments-form__field">
                      <label className="comments-form__label" htmlFor={commentBodyId}>
                        Your comment
                      </label>
                      <textarea
                        id={commentBodyId}
                        name="body"
                        value={commentBody}
                        onChange={handleBodyChange}
                        rows={3}
                        placeholder="What stood out about this build?"
                        maxLength={2000}
                        required
                      />
                    </div>
                    <div className="comments-form__actions">
                      <button type="submit" className="btn primary" disabled={submitting}>
                        {submitting ? "Posting…" : "Post comment"}
                      </button>
                      <button type="button" className="btn ghost" onClick={handleComposeClose}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="btn primary comments-compose__trigger"
                    onClick={handleComposeOpen}
                    aria-expanded={isComposeOpen}
                  >
                    Comment
                  </button>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
