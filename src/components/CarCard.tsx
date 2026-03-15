import { useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, MapPin, Clock, Sparkles, ExternalLink, Share2, ThumbsUp } from "lucide-react";
import { motion } from "framer-motion";
import {
  NormalizedCar,
  formatPrice,
  formatMileage,
  formatCountdown,
  daysSince,
  getSourceLabel,
} from "@/lib/normalizeCar";
import { useCarLike } from "@/hooks/useCarLike";
import { useShare } from "@/hooks/useShare";
import { useCommentCount } from "@/hooks/useCommentCount";
import CommentsModal from "@/components/CommentsModal";

interface CarCardProps {
  car: NormalizedCar;
  index?: number;
}

export default function CarCard({ car, index = 0 }: CarCardProps) {
  const isAuction = car.auctionStatus === "AUCTION_IN_PROGRESS";
  const isSold = car.auctionStatus === "SOLD";
  const isLive = car.auctionStatus === "LIVE";

  const isFacebook = car.source?.includes("facebook");
  const isPCA = car.source === "pca";

  const priceLabel = isAuction ? "Current Bid" : "Price";
  const displayPrice = isAuction ? (car.currentBid ?? car.price) : car.price;

  const sourceLabel = getSourceLabel(car.source);
  const dealershipLabel = car.dealershipName || sourceLabel;

  const listedDays = daysSince(car.createdAt ?? car.postedAt);
  const listedLabel = listedDays != null ? `Days Listed: ${listedDays}` : null;

  const hasEstimate = car.estimatedValueNumber != null && car.estimatedValueNumber > 0;
  const estimateDisplay = hasEstimate
    ? formatPrice(car.estimatedValueNumber!, car.currency)
    : car.estimatedValue || null;

  const detailPath = `/cars/${encodeURIComponent(car.id)}`;

  // ── Likes (V1-matching behavior) ──
  const likeId = car.id && /^\d+$/.test(String(car.id)) ? String(car.id) : null;
  const { count: likeCount, liked, saving: likeSaving, addLike } = useCarLike(
    likeId,
    car.likes,
    false
  );

  // ── Share (V1-matching: native share → clipboard fallback) ──
  const { shareState, handleShare } = useShare();
  const shareUrl = car.id
    ? `${window.location.origin}/share/${encodeURIComponent(car.id)}`
    : "";

  // ── Comment count (fetched live from API like V1) ──
  const { count: commentCount, loading: commentsLoading, fetchCount: refreshCommentCount, increment: incrementCommentCount } = useCommentCount(likeId);
  const commentDisplay = commentsLoading ? "…" : (commentCount ?? car.commentCount ?? 0);

  // ── Comments modal ──
  const [commentsOpen, setCommentsOpen] = useState(false);
  const scrollYRef = useRef(0);

  const openComments = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!likeId) return;
    scrollYRef.current = window.scrollY || 0;
    setCommentsOpen(true);
  }, [likeId]);

  const closeComments = useCallback(() => {
    const saved = scrollYRef.current;
    setCommentsOpen(false);
    requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: "auto" }));
  }, []);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className="car-card-article"
    >
      <Link to={detailPath} className="block group">
        <div className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg hover:shadow-foreground/5 transition-all duration-300">
          {/* Image */}
          <div className="relative aspect-[16/10] overflow-hidden">
            {car.imageUrl ? (
              <img
                src={car.imageUrl}
                alt={car.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-sm">
                No Photo
              </div>
            )}

            {/* Status badges */}
            <div className="absolute top-3 left-3 flex items-center gap-2">
              {isLive && !isFacebook && !isPCA && (
                <span className="badge-for-sale">FOR SALE</span>
              )}
              {isAuction && (
                <span className="badge-auction">
                  <Clock className="w-3 h-3" /> AUCTION
                </span>
              )}
              {isSold && <span className="badge-sold">SOLD</span>}
              {isFacebook && !isAuction && (
                <span className="badge-facebook">FB</span>
              )}
              {isPCA && !isAuction && (
                <span className="badge-pca">PCA</span>
              )}
            </div>

            {/* Countdown */}
            {isAuction && car.endTime && (
              <div className="absolute top-3 right-3 text-[11px] font-semibold text-card bg-foreground/70 backdrop-blur-sm px-2 py-1 rounded-md">
                {formatCountdown(car.endTime)}
              </div>
            )}

            {/* Source badge bottom-left */}
            <div className="absolute bottom-3 left-3">
              <span className="badge-source">{sourceLabel}</span>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            {/* Title + Dealership logo */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-[15px] leading-snug line-clamp-2 group-hover:text-primary transition-colors flex-1">
                {car.title}
              </h3>
              {car.dealership?.logo_url && (
                <img
                  src={car.dealership.logo_url.startsWith("http") ? car.dealership.logo_url : `https://api.vinfreak.com${car.dealership.logo_url}`}
                  alt={car.dealershipName || ""}
                  className="w-10 h-10 object-contain flex-shrink-0 rounded"
                />
              )}
            </div>

            {/* Interactive chips row: like, comments, share, transmission */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {/* Like button */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  addLike();
                }}
                disabled={likeSaving || !likeId}
                className={`car-chip interactive ${liked ? "car-chip--liked" : ""}`}
                aria-label={`Like ${car.title} (${likeCount} likes)`}
              >
                <span className="text-sm">👍</span>
                <span>{likeCount}</span>
              </button>

              {/* Comment count */}
              <button
                type="button"
                onClick={openComments}
                className="car-chip interactive"
                aria-label={`View comments for ${car.title}`}
              >
                <MessageCircle className="w-3 h-3" />
                <span>{commentDisplay}</span>
              </button>

              {/* Share button */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleShare(shareUrl, car.title);
                }}
                className={`car-chip interactive ${shareState !== "idle" ? "car-chip--shared" : ""}`}
                aria-label={`Share ${car.title}`}
              >
                <Share2 className="w-3 h-3" />
                <span>{shareState === "copied" ? "Copied!" : shareState === "shared" ? "Shared!" : "Share"}</span>
              </button>

              {car.transmissionTag && (
                <span className="car-chip">{car.transmissionTag}</span>
              )}
              {listedLabel && (
                <span className="car-chip">{listedLabel}</span>
              )}
            </div>

            {/* Specs grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">{priceLabel}</span>
                <p className="font-bold text-base">{formatPrice(displayPrice, car.currency)}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Mileage</span>
                <p className="font-medium">{formatMileage(car.mileage)}</p>
              </div>

              {/* Estimated Value */}
              {(isAuction && estimateDisplay) && (
                <div>
                  <span className="text-muted-foreground text-xs">Estimated Value</span>
                  <p className="font-medium flex items-center gap-1">
                    {estimateDisplay}
                    <Sparkles className="w-3 h-3 text-primary" />
                  </p>
                </div>
              )}

              <div>
                <span className="text-muted-foreground text-xs">Location</span>
                <p className="font-medium flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                  {car.location || "—"}
                </p>
              </div>
            </div>

            {/* FREAKStats button */}
            <button
              className="freakstats-btn"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <Sparkles className="w-4 h-4" />
              <span className="font-semibold text-xs">AI</span>
              Get insights with FREAKStats
            </button>

            {/* View on source link */}
            {car.url && car.url !== "#" && (
              <a
                href={car.url}
                target="_blank"
                rel="noopener noreferrer"
                className="view-source-link"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>View directly on </span>
                <strong>{dealershipLabel}</strong>
              </a>
            )}
          </div>
        </div>
      </Link>

      {commentsOpen && likeId && (
        <CommentsModal
          carId={likeId}
          carTitle={car.title}
          carImage={car.imageUrl}
          onClose={closeComments}
          onCommentApproved={incrementCommentCount}
          refreshCount={refreshCommentCount}
        />
      )}
    </motion.article>
  );
}
