import { useMemo, useState } from "react";
import { NormalizedCar, formatPrice } from "@/lib/normalizeCar";
import { computeFreakScore, getScoreLabel } from "@/lib/freakScore";
import {
  X, TrendingDown, TrendingUp, Target, Shield, AlertTriangle,
  ChevronDown, ChevronUp, Zap, DollarSign, BarChart3,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import coachAvatar from "@/assets/freakcoach-avatar.png";

interface Props {
  car: NormalizedCar;
  onClose: () => void;
}

interface OfferTier {
  label: string;
  price: number;
  pct: number;
  description: string;
  icon: React.ReactNode;
  colorClass: string;
}

function computeNegotiationData(car: NormalizedCar) {
  const score = computeFreakScore(car);
  const askPrice = car.price;
  if (!askPrice || askPrice <= 0) return null;

  const estimatedValue = car.estimatedValueNumber && car.estimatedValueNumber > 0
    ? car.estimatedValueNumber
    : null;

  // Determine market position
  const referencePrice = estimatedValue || askPrice;
  const overMarket = estimatedValue ? ((askPrice - estimatedValue) / estimatedValue) * 100 : 0;

  // Mileage factor
  let mileageFactor = 0;
  if (car.mileage != null && car.year) {
    const age = Math.max(1, new Date().getFullYear() - car.year);
    const avgPerYear = car.mileage / age;
    if (avgPerYear < 5000) mileageFactor = -2;      // low = less room to negotiate
    else if (avgPerYear < 10000) mileageFactor = -1;
    else if (avgPerYear < 15000) mileageFactor = 0;
    else if (avgPerYear < 25000) mileageFactor = 2;
    else mileageFactor = 4;
  }

  // Days listed factor
  let daysFactor = 0;
  if (car.createdAt || car.postedAt) {
    const days = Math.floor(
      (Date.now() - new Date(car.createdAt || car.postedAt!).getTime()) / 86400000
    );
    if (days <= 3) daysFactor = -2;   // fresh = less leverage
    else if (days <= 7) daysFactor = 0;
    else if (days <= 21) daysFactor = 2;
    else if (days <= 45) daysFactor = 4;
    else daysFactor = 6;
  }

  // Engagement factor (high = competitive = less room)
  const engagement = (car.likes || 0) + (car.commentCount || 0);
  let engagementFactor = 0;
  if (engagement >= 20) engagementFactor = -3;
  else if (engagement >= 10) engagementFactor = -1;
  else if (engagement >= 3) engagementFactor = 0;
  else engagementFactor = 2;

  // Score adjustment
  let scoreFactor = 0;
  if (score != null) {
    if (score >= 80) scoreFactor = -2;     // great deal already
    else if (score >= 60) scoreFactor = 0;
    else if (score >= 40) scoreFactor = 3;
    else scoreFactor = 5;                  // poor deal = more room
  }

  // Base negotiation room (percentage off ask)
  const isAuction = car.auctionStatus === "AUCTION_IN_PROGRESS";
  let baseDiscount = isAuction ? 2 : 7;

  // Add market over/under
  if (overMarket > 10) baseDiscount += 4;
  else if (overMarket > 5) baseDiscount += 2;
  else if (overMarket < -5) baseDiscount -= 3;

  const totalDiscount = Math.max(
    1,
    Math.min(25, baseDiscount + mileageFactor + daysFactor + engagementFactor + scoreFactor)
  );

  // Generate 3 offer tiers
  const aggressive = Math.round(askPrice * (1 - totalDiscount / 100));
  const fair = Math.round(askPrice * (1 - totalDiscount * 0.55 / 100));
  const opening = Math.round(askPrice * (1 - totalDiscount * 0.25 / 100));

  const tiers: OfferTier[] = [
    {
      label: "Aggressive Offer",
      price: aggressive,
      pct: -totalDiscount,
      description: "Lowball but defensible. Use if listing has been sitting or is overpriced.",
      icon: <TrendingDown className="w-5 h-5" />,
      colorClass: "text-destructive",
    },
    {
      label: "Fair Offer",
      price: fair,
      pct: -(totalDiscount * 0.55),
      description: "Most likely to be accepted. Reflects market data and vehicle condition.",
      icon: <Target className="w-5 h-5" />,
      colorClass: "text-success",
    },
    {
      label: "Opening Offer",
      price: opening,
      pct: -(totalDiscount * 0.25),
      description: "Conservative start. Shows serious intent while leaving minor room.",
      icon: <TrendingUp className="w-5 h-5" />,
      colorClass: "text-primary",
    },
  ];

  // Build talking points
  const points: string[] = [];
  if (overMarket > 5) points.push(`Listed ${overMarket.toFixed(0)}% above estimated market value`);
  if (overMarket < -5) points.push(`Listed ${Math.abs(overMarket).toFixed(0)}% below market — limited room to negotiate`);
  if (mileageFactor >= 2) points.push("Higher-than-average mileage for the year — use as leverage");
  if (mileageFactor <= -1) points.push("Low mileage is a strong selling point — expect less flexibility");
  if (daysFactor >= 4) points.push("Listing has been active for a while — seller may be motivated");
  if (daysFactor <= -2) points.push("Freshly listed — seller unlikely to budge on price early");
  if (engagementFactor <= -3) points.push("High engagement — others are interested, act quickly");
  if (engagementFactor >= 2) points.push("Low engagement — you have leverage as a serious buyer");
  if (score != null && score < 40) points.push("FREAK Score is below average — use this in your pitch");
  if (score != null && score >= 80) points.push("FREAK Score is strong — this is already a solid deal");
  if (isAuction) points.push("Auction format limits negotiation — bid strategically near the close");

  if (points.length === 0) points.push("Standard market pricing — reasonable room for a polite counter-offer");

  return { score, tiers, points, estimatedValue, overMarket, isAuction, totalDiscount };
}

export default function NegotiationCoachModal({ car, onClose }: Props) {
  const data = useMemo(() => computeNegotiationData(car), [car]);
  const [expandedTier, setExpandedTier] = useState<number | null>(1); // fair open by default

  if (!data) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          className="modal-container max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2 className="text-lg font-bold"><span className="text-primary">FREAK</span>Coach</h2>
            <button onClick={onClose} className="modal-close"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6 text-center text-muted-foreground">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-warning" />
            <p>Price data unavailable for this listing.</p>
          </div>
        </motion.div>
      </div>
    );
  }

  const { score, tiers, points, estimatedValue, isAuction, totalDiscount } = data;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
        className="modal-container max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <img
              src={coachAvatar}
              alt="FREAKCoach"
              className="w-11 h-11 rounded-full border-2 border-primary/30 object-cover"
            />
            <div>
              <h2 className="text-lg font-bold tracking-tight">
                <span className="text-primary">FREAK</span>Coach
              </h2>
              <p className="text-[11px] text-muted-foreground">Your AI negotiation strategist</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center p-3 rounded-xl bg-background border border-border">
              <DollarSign className="w-4 h-4 text-muted-foreground mb-1" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Ask Price</span>
              <span className="text-sm font-bold">{formatPrice(car.price, car.currency)}</span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-xl bg-background border border-border">
              <BarChart3 className="w-4 h-4 text-muted-foreground mb-1" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Est. Value</span>
              <span className="text-sm font-bold">
                {estimatedValue ? formatPrice(estimatedValue, car.currency) : "N/A"}
              </span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-xl bg-background border border-border">
              <Zap className="w-4 h-4 text-muted-foreground mb-1" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">FREAK</span>
              <span className="text-sm font-bold">
                {score != null ? `${score} — ${getScoreLabel(score)}` : "N/A"}
              </span>
            </div>
          </div>

          {/* Negotiation room indicator */}
          <div className="rounded-xl bg-background border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Negotiation Room
              </span>
              <span className="text-sm font-bold text-primary">~{totalDiscount}% off</span>
            </div>
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, totalDiscount * 4)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {isAuction
                ? "Auction listings have limited negotiation room — bid strategically."
                : totalDiscount >= 10
                  ? "Significant room to negotiate. The listing shows multiple leverage points."
                  : totalDiscount >= 5
                    ? "Moderate room for negotiation. A fair counter-offer should work."
                    : "Tight margins. This listing is competitively priced."
              }
            </p>
          </div>

          {/* Offer tiers */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Suggested Offers
            </h3>
            {tiers.map((tier, i) => (
              <div
                key={tier.label}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                <button
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/30 transition-colors"
                  onClick={() => setExpandedTier(expandedTier === i ? null : i)}
                >
                  <div className={`flex-shrink-0 ${tier.colorClass}`}>{tier.icon}</div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold">{tier.label}</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-base font-bold">{formatPrice(tier.price, car.currency)}</span>
                    <span className={`text-[11px] ml-1.5 font-medium ${tier.colorClass}`}>
                      {tier.pct.toFixed(1)}%
                    </span>
                  </div>
                  {expandedTier === i ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
                <AnimatePresence>
                  {expandedTier === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className="px-4 pb-4 text-sm text-muted-foreground border-t border-border pt-3">
                        {tier.description}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          {/* Talking points */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Talking Points
            </h3>
            <ul className="space-y-1.5">
              {points.map((pt, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                  {pt}
                </li>
              ))}
            </ul>
          </div>

          {/* Disclaimer */}
          <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
            Estimates are algorithmic and based on available data. Always verify condition, history,
            and local market before making an offer.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
