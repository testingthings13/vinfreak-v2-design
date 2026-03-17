import { Link } from "react-router-dom";
import { Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { formatPrice } from "@/lib/normalizeCar";
import { useRef } from "react";

export default function RecentlyViewed() {
  const { recent } = useRecentlyViewed();
  const scrollRef = useRef<HTMLDivElement>(null);

  if (recent.length === 0) return null;

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -240 : 240, behavior: "smooth" });
  };

  return (
    <section className="recently-viewed-section">
      <div className="container space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Recently Viewed
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
          {recent.map((car) => (
            <Link
              key={car.id}
              to={`/cars/${encodeURIComponent(car.id)}`}
              className="recently-viewed-card group"
            >
              {car.imageUrl ? (
                <img
                  src={car.imageUrl}
                  alt={car.title}
                  className="w-full h-24 object-cover rounded-lg group-hover:scale-[1.03] transition-transform duration-300"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-24 rounded-lg bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                  No Photo
                </div>
              )}
              <p className="text-xs font-medium truncate text-foreground group-hover:text-primary transition-colors mt-1.5">
                {car.title}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatPrice(car.price, car.currency)}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
