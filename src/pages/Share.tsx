import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCarById, getCars } from "@/lib/api";
import { normalizeCar, formatPrice, formatMileage } from "@/lib/normalizeCar";
import type { NormalizedCar } from "@/lib/normalizeCar";
import CarCard from "@/components/CarCard";
import FreakScoreBadge from "@/components/FreakScoreBadge";
import Layout from "@/components/Layout";
import { Loader2, ExternalLink, MapPin, ArrowLeft } from "lucide-react";
import { useEffect, useState, useCallback } from "react";

function useShareMeta(car: NormalizedCar | null) {
  useEffect(() => {
    if (!car) return;
    document.title = `${car.title} | VINFREAK`;

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    const desc = `${formatPrice(car.price, car.currency)} · ${formatMileage(car.mileage)} · ${car.location || "VINFREAK"}`;

    // OG tags
    setMeta("property", "og:title", car.title);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", "VINFREAK");
    setMeta("property", "og:url", window.location.href);
    if (car.imageUrl) {
      setMeta("property", "og:image", car.imageUrl);
      setMeta("property", "og:image:width", "1200");
      setMeta("property", "og:image:height", "630");
    }

    // Twitter tags
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", car.title);
    setMeta("name", "twitter:description", desc);
    if (car.imageUrl) setMeta("name", "twitter:image", car.imageUrl);
  }, [car]);
}

export default function Share() {
  const { id } = useParams();

  const { data: rawCar, isLoading, isError } = useQuery({
    queryKey: ["share-car", id],
    queryFn: () => getCarById(id!),
    enabled: !!id,
    retry: 1,
  });

  const car = rawCar ? normalizeCar(rawCar) : null;
  useShareMeta(car);

  // Paginated listings below shared card
  const [moreCars, setMoreCars] = useState<NormalizedCar[]>([]);
  const [morePage, setMorePage] = useState(1);
  const [moreTotal, setMoreTotal] = useState(0);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = useCallback(async (page: number) => {
    if (!car?.make) return;
    setMoreLoading(true);
    try {
      const filters: any = { make: car.make };
      const res = await getCars(filters, { page, pageSize: 12 });
      const items = res.items
        .map(normalizeCar)
        .filter((c: NormalizedCar) => c.id !== car.id);
      setMoreCars((prev) => page === 1 ? items : [...prev, ...items]);
      setMoreTotal(res.total);
      setHasMore(res.hasMore || (page * 12 < res.total));
    } finally {
      setMoreLoading(false);
    }
  }, [car?.make, car?.id]);

  useEffect(() => {
    if (car?.make) loadMore(1);
  }, [car?.make]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!car || isError) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold text-foreground">Listing Not Found</h1>
        <p className="text-muted-foreground text-sm">This vehicle may have been removed or is no longer available.</p>
        <Link to="/" className="text-primary hover:underline flex items-center gap-1 text-sm">
          <ArrowLeft className="w-4 h-4" /> Browse all listings
        </Link>
      </div>
    );
  }

  return (
    <Layout>
      <div className="container py-10 space-y-10">
        {/* Shared Card */}
        <div className="max-w-2xl mx-auto">
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-lg">
            {car.imageUrl && (
              <div className="aspect-[16/10] overflow-hidden">
                <img src={car.imageUrl} alt={car.title} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-xl font-bold">{car.title}</h1>
                <FreakScoreBadge car={car} size="sm" />
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p className="font-bold text-lg text-primary">{formatPrice(car.price, car.currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Mileage</p>
                  <p className="font-semibold">{formatMileage(car.mileage)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p className="font-medium flex items-center justify-center gap-1 text-sm">
                    <MapPin className="w-3 h-3" /> {car.location || "—"}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Link
                  to={`/cars/${encodeURIComponent(car.id)}`}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
                >
                  View on VINFREAK
                </Link>
                {car.url && car.url !== "#" && (
                  <a
                    href={car.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> Source
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* More listings */}
        {moreCars.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">More on VINFREAK</h2>
              <Link to="/" className="text-sm text-primary hover:underline">
                Browse all →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {moreCars.map((c) => (
                <CarCard key={c.id} car={c} />
              ))}
            </div>
            {hasMore && (
              <div className="flex flex-col items-center gap-2 pt-2">
                <p className="text-xs text-muted-foreground">
                  {moreCars.length} of {moreTotal} vehicles loaded
                </p>
                <button
                  onClick={() => {
                    const next = morePage + 1;
                    setMorePage(next);
                    loadMore(next);
                  }}
                  disabled={moreLoading}
                  className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {moreLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    "Load More"
                  )}
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}
