import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getCars } from "@/lib/api";
import { normalizeCar, NormalizedCar, formatPrice } from "@/lib/normalizeCar";
import { computeFreakScore } from "@/lib/freakScore";
import FreakScoreBadge from "./FreakScoreBadge";
import { Crown, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { useRef, useState } from "react";

export default function WeeklyFreakPicks() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const { data: picks, isLoading } = useQuery({
    queryKey: ["weekly-freak-picks"],
    queryFn: async () => {
      const res = await getCars({ sort: "relevance" }, { page: 1, pageSize: 50 });
      const normalized = res.items.map((r: any) => normalizeCar(r));

      // Score and rank — pick top 8
      const scored = normalized
        .map((car: NormalizedCar) => ({ car, score: computeFreakScore(car) ?? 0 }))
        .filter((e: { score: number }) => e.score >= 55)
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
        .slice(0, 8)
        .map((e: { car: NormalizedCar }) => e.car);

      return scored as NormalizedCar[];
    },
    staleTime: 300_000,
    retry: 1,
  });

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  };

  if (isLoading || !picks?.length) return null;

  return (
    <section className="freak-picks-section">
      <div className="container">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-warning" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Weekly FREAK Picks
            </h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/20">
              Top Scored
            </span>
          </div>
        </div>

        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex gap-3 overflow-x-auto scrollbar-hide pb-2"
          >
            {picks.map((car, i) => (
              <motion.div
                key={car.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  to={`/cars/${encodeURIComponent(car.id)}`}
                  className="freak-pick-card group"
                >
                  <div className="relative aspect-[16/10] rounded-lg overflow-hidden">
                    {car.imageUrl ? (
                      <img
                        src={car.imageUrl}
                        alt={car.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-xs">
                        No Photo
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <FreakScoreBadge car={car} size="sm" />
                    </div>
                    {i === 0 && (
                      <div className="absolute top-2 left-2">
                        <span className="freak-pick-rank">🏆 #1</span>
                      </div>
                    )}
                    {i > 0 && i < 3 && (
                      <div className="absolute top-2 left-2">
                        <span className="freak-pick-rank">#{i + 1}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-2.5 space-y-1">
                    <h3 className="text-xs font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {car.title}
                    </h3>
                    <p className="text-sm font-bold text-primary">
                      {formatPrice(car.price, car.currency)}
                    </p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {canScrollRight && (
            <div className="absolute right-0 top-0 bottom-2 w-12 flex items-center justify-end pointer-events-none bg-gradient-to-l from-background to-transparent">
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
