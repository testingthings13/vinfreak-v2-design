import { useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCars } from "@/lib/api";
import { normalizeCar, formatPrice, NormalizedCar } from "@/lib/normalizeCar";
import { Flame, ChevronLeft, ChevronRight } from "lucide-react";

export default function TrendingCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: cars } = useQuery({
    queryKey: ["trending-cars"],
    queryFn: async () => {
      const res = await getCars({ sort: "relevance" }, { page: 1, pageSize: 10 });
      return res.items.map((r: any) => normalizeCar(r));
    },
    staleTime: 300_000,
  });

  if (!cars || cars.length === 0) return null;

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -280 : 280, behavior: "smooth" });
  };

  return (
    <section className="trending-section">
      <div className="container space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Flame className="w-4 h-4 text-warning" />
            Hot Right Now
          </h2>
          <div className="flex items-center gap-1">
            <button onClick={() => scroll("left")} className="recently-viewed-nav" aria-label="Scroll left">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => scroll("right")} className="recently-viewed-nav" aria-label="Scroll right">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {cars.map((car: NormalizedCar) => (
            <Link
              key={car.id}
              to={`/cars/${encodeURIComponent(car.id)}`}
              className="trending-card group"
            >
              <div className="relative overflow-hidden rounded-lg">
                {car.imageUrl ? (
                  <img
                    src={car.imageUrl}
                    alt={car.title}
                    className="w-full h-32 object-cover group-hover:scale-[1.05] transition-transform duration-500"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-32 bg-muted flex items-center justify-center text-[10px] text-muted-foreground rounded-lg">
                    No Photo
                  </div>
                )}
                {car.likes > 0 && (
                  <span className="absolute bottom-1.5 right-1.5 trending-likes-badge">
                    👍 {car.likes}
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold truncate text-foreground group-hover:text-primary transition-colors mt-2">
                {car.title}
              </p>
              <p className="text-[11px] font-medium text-primary">
                {formatPrice(car.price, car.currency)}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
