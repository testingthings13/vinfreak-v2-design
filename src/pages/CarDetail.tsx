import { useParams, Link } from "react-router-dom";
import coachAvatar from "@/assets/freakcoach-avatar.png";
import { useQuery } from "@tanstack/react-query";
import { useState, useCallback, useRef, useEffect } from "react";
import { getCarById } from "@/lib/api";
import { normalizeCar, formatPrice, formatMileage, getSourceLabel } from "@/lib/normalizeCar";
import Layout from "@/components/Layout";
import Gallery from "@/components/Gallery";
import SpecGrid from "@/components/SpecGrid";
import DetailSections from "@/components/DetailSections";
import CommentsModal from "@/components/CommentsModal";
import FreakStatsModal from "@/components/FreakStatsModal";
import AskSellerModal from "@/components/AskSellerModal";
import WouldYouBuyPoll from "@/components/WouldYouBuyPoll";
import FreakScoreBadge from "@/components/FreakScoreBadge";
import NegotiationCoachModal from "@/components/NegotiationCoachModal";
import SimilarCars from "@/components/SimilarCars";
import { useCarLike } from "@/hooks/useCarLike";
import { useShare } from "@/hooks/useShare";
import { useCommentCount } from "@/hooks/useCommentCount";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { useCountdown } from "@/hooks/useCountdown";
import {
  ArrowLeft, ExternalLink, MapPin, Clock, ThumbsUp, MessageCircle,
  Share2, Sparkles, Loader2, Mail, DollarSign,
} from "lucide-react";
import { motion } from "framer-motion";

export default function CarDetail() {
  const { id } = useParams();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [freakStatsOpen, setFreakStatsOpen] = useState(false);
  const [askSellerOpen, setAskSellerOpen] = useState(false);
  const [negotiationOpen, setNegotiationOpen] = useState(false);
  const scrollYRef = useRef(0);

  const { data: rawCar, isLoading } = useQuery({
    queryKey: ["car", id],
    queryFn: () => getCarById(id!),
    enabled: !!id,
    retry: 1,
  });

  const car = rawCar ? normalizeCar(rawCar) : null;

  const countdown = useCountdown(car?.endTime ?? null);

  const { trackView } = useRecentlyViewed();
  useEffect(() => { if (car) trackView(car); }, [car?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const likeId = car?.id && /^\d+$/.test(String(car.id)) ? String(car.id) : null;
  const { count: likeCount, liked, saving: likeSaving, addLike } = useCarLike(likeId, car?.likes ?? 0, false);
  const { shareState, handleShare } = useShare();
  const { count: commentCount, fetchCount: refreshCommentCount, increment: incrementCommentCount } = useCommentCount(likeId);

  const openComments = useCallback(() => {
    scrollYRef.current = window.scrollY;
    setCommentsOpen(true);
  }, []);

  const closeComments = useCallback(() => {
    const saved = scrollYRef.current;
    setCommentsOpen(false);
    requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: "auto" }));
  }, []);

  const shareUrl = car?.id ? `https://api.vinfreak.com/share/${encodeURIComponent(car.id)}` : "";

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-20 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!car) {
    return (
      <Layout>
        <div className="container py-20 text-center">
          <h1 className="text-3xl font-bold mb-4">Vehicle Not Found</h1>
          <Link to="/" className="text-primary hover:underline">← Back to listings</Link>
        </div>
      </Layout>
    );
  }

  const isAuction = car.auctionStatus === "AUCTION_IN_PROGRESS" && !countdown.ended;
  const isSold = car.auctionStatus === "SOLD" || (car.auctionStatus === "AUCTION_IN_PROGRESS" && countdown.ended);
  const priceLabel = isAuction ? "Current Bid" : isSold ? "Sold For" : "Price";
  const displayPrice = isAuction ? (car.currentBid ?? car.price) : car.price;
  const sourceLabel = getSourceLabel(car.source);
  const dealerLabel = car.dealershipName || sourceLabel;

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <span>/</span>
          <span className="text-foreground truncate">{car.title}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Images + content */}
          <div className="lg:col-span-2 space-y-5">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Gallery images={car.images} title={car.title} />
            </motion.div>

            {/* Specs */}
            <section className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h2 className="font-semibold text-lg">Specifications</h2>
              <SpecGrid car={car} />
            </section>

            {/* Description, highlights, etc */}
            <DetailSections car={car} />
          </div>

          {/* Right: Sidebar */}
          <div className="space-y-4">
            <div className="bg-card rounded-xl border border-border p-6 space-y-4 sticky top-20">
              {/* Title + badges */}
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h1 className="font-bold text-lg leading-snug">{car.title}</h1>
                  {car.engine && <p className="text-sm text-muted-foreground mt-1">{car.engine}</p>}
                </div>
                {car.dealership?.logo_url && (
                  <img
                    src={car.dealership.logo_url.startsWith("http") ? car.dealership.logo_url : `https://api.vinfreak.com${car.dealership.logo_url}`}
                    alt={car.dealershipName || ""}
                    className="w-12 h-12 object-contain flex-shrink-0 rounded"
                  />
                )}
              </div>

              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {car.auctionStatus === "LIVE" && <span className="badge-for-sale">FOR SALE</span>}
                {isAuction && (
                  <span className="badge-auction">
                    <Clock className="w-3 h-3" /> AUCTION
                  </span>
                )}
                {isSold && <span className="badge-sold">SOLD</span>}
                {isAuction && countdown.text && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-md bg-warning/10 text-warning border border-warning/20">
                    {countdown.text}
                  </span>
                )}
              </div>

              <hr className="border-border" />

              {/* Price */}
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{priceLabel}</p>
                <p className="text-3xl font-bold text-primary">{formatPrice(displayPrice, car.currency)}</p>
                {isAuction && car.bidCount > 0 && (
                  <p className="text-sm text-muted-foreground">{car.bidCount} bids</p>
                )}
                {car.estimatedValue && (
                  <div className="mt-2 flex items-center gap-1.5 text-sm">
                    <span className="text-muted-foreground">Est. Value:</span>
                    <span className="font-semibold">{car.estimatedValue}</span>
                    <Sparkles className="w-3 h-3 text-primary" />
                  </div>
                )}
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center p-3 rounded-xl bg-background text-center">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Mileage</span>
                  <span className="text-sm font-bold mt-0.5">{formatMileage(car.mileage)}</span>
                </div>
                <div className="flex flex-col items-center p-3 rounded-xl bg-background text-center">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Trans.</span>
                  <span className="text-sm font-bold mt-0.5">{car.transmissionTag || car.transmission || "—"}</span>
                </div>
              </div>

              <hr className="border-border" />

              {/* Location */}
              {car.location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 flex-shrink-0" /> {car.location}
                </div>
              )}

              {/* Dealer */}
              {car.dealershipName && (
                <div className="px-3 py-2 rounded-lg bg-background text-sm">
                  <span className="text-muted-foreground">Listed by:</span>{" "}
                  <span className="font-medium">{car.dealershipName}</span>
                </div>
              )}

              {/* CTA */}
              {!isSold && car.url && car.url !== "#" && (
                <a
                  href={car.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
                >
                  View on {dealerLabel} <ExternalLink className="w-4 h-4" />
                </a>
              )}

              {/* Action buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={addLike}
                  disabled={likeSaving || !likeId}
                  className={`car-chip interactive justify-center py-2 ${liked ? "car-chip--liked" : ""}`}
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">{likeCount}</span>
                </button>
                <button
                  onClick={openComments}
                  className="car-chip interactive justify-center py-2"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">{commentCount ?? 0}</span>
                </button>
                <button
                  onClick={() => handleShare(shareUrl, car.title)}
                  className={`car-chip interactive justify-center py-2 ${shareState !== "idle" ? "car-chip--shared" : ""}`}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">
                    {shareState === "copied" ? "Copied" : shareState === "shared" ? "Done" : "Share"}
                  </span>
                </button>
              </div>

              {/* FREAKStats */}
              <button
                className="freakstats-btn"
                onClick={() => setFreakStatsOpen(true)}
              >
                <Sparkles className="w-4 h-4" />
                <span className="font-semibold text-xs">AI</span>
                Get insights with FREAKStats
              </button>

              {/* Ask the Seller */}
              <button
                className="flex items-center gap-2 w-full py-2.5 px-4 rounded-lg bg-accent/50 border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
                onClick={() => setAskSellerOpen(true)}
              >
                <Mail className="w-4 h-4 text-primary" />
                Ask the Seller
              </button>

              {/* FREAKCoach */}
              {!isSold && (
                <button
                  className="group/coach relative flex items-center gap-3 w-full py-3 px-4 rounded-xl bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 border border-primary/25 text-foreground text-sm font-semibold hover:from-primary/25 hover:via-primary/15 hover:to-primary/10 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 transition-all duration-300 overflow-hidden"
                  onClick={() => setNegotiationOpen(true)}
                >
                  <img
                    src={coachAvatar}
                    alt=""
                    className="w-9 h-9 rounded-full border-2 border-primary/30 object-cover group-hover/coach:scale-110 transition-transform duration-300"
                  />
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-bold tracking-tight">
                      <span className="text-primary">FREAK</span>Coach
                    </span>
                    <span className="text-[10px] text-muted-foreground font-normal">Get your deal strategy</span>
                  </div>
                  <DollarSign className="w-4 h-4 text-primary ml-auto opacity-60 group-hover/coach:opacity-100 transition-opacity" />
                </button>
              )}

              {/* Would You Buy? */}
              <WouldYouBuyPoll carId={likeId} />

              {/* FREAK Score */}
              <div className="flex justify-center">
                <FreakScoreBadge car={car} size="md" />
              </div>

              {/* VIN */}
              {car.vin && (
                <p className="text-[10px] text-muted-foreground text-center">VIN: {car.vin}</p>
              )}
            </div>
          </div>
        </div>

        {/* Similar Cars */}
        {car && <SimilarCars car={car} />}
      </div>

      {/* Modals */}
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

      {freakStatsOpen && car && (
        <FreakStatsModal car={car} onClose={() => setFreakStatsOpen(false)} />
      )}

      {askSellerOpen && car && (
        <AskSellerModal car={car} onClose={() => setAskSellerOpen(false)} />
      )}

      {negotiationOpen && car && (
        <NegotiationCoachModal car={car} onClose={() => setNegotiationOpen(false)} />
      )}
    </Layout>
  );
}
