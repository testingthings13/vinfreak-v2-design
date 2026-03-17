import { useQuery } from "@tanstack/react-query";
import { getCars } from "@/lib/api";
import { normalizeCar, type NormalizedCar } from "@/lib/normalizeCar";
import CarCard from "@/components/CarCard";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, useCallback } from "react";

interface Props {
  car: NormalizedCar;
}

export default function SimilarCars({ car }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const { data: similar = [], isLoading } = useQuery({
    queryKey: ["similar-cars", car.make, car.model, car.price],
    queryFn: async () => {
      const priceRange = car.price ? 0.4 : 0;
      const filters: any = {};
      if (car.make) filters.make = car.make;
      if (car.model) filters.model = car.model;
      if (car.price && priceRange) {
        filters.priceMin = Math.round(car.price * (1 - priceRange));
        filters.priceMax = Math.round(car.price * (1 + priceRange));
      }

      const res = await getCars(filters, { pageSize: 12 });
      return res.items
        .map(normalizeCar)
        .filter((c: NormalizedCar) => c.id !== car.id)
        .slice(0, 6);
    },
    enabled: !!car.make,
    staleTime: 60_000,
  });

  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" });
  };

  if (!car.make || isLoading || similar.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">Cars Like This</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className="p-1.5 rounded-lg border border-border bg-card hover:bg-accent disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className="p-1.5 rounded-lg border border-border bg-card hover:bg-accent disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={updateScroll}
        className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1"
      >
        {similar.map((c) => (
          <div key={c.id} className="flex-shrink-0 w-[280px]">
            <CarCard car={c} />
          </div>
        ))}
      </div>
    </section>
  );
}
