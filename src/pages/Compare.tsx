import { useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { getCarById } from "@/lib/api";
import { normalizeCar, NormalizedCar, formatPrice, formatMileage } from "@/lib/normalizeCar";
import { ArrowLeft, Trophy, Minus, MapPin, Calendar, Gauge, Sparkles, ExternalLink } from "lucide-react";

function CompareRow({ label, values, highlight }: { label: string; values: (string | null)[]; highlight?: "lowest" | "highest" | null }) {
  // Determine best value for highlighting
  let bestIdx = -1;
  if (highlight) {
    const nums = values.map((v) => {
      if (!v) return null;
      const n = parseFloat(v.replace(/[^0-9.-]/g, ""));
      return isNaN(n) ? null : n;
    });
    const valid = nums.filter((n) => n !== null) as number[];
    if (valid.length > 1) {
      const best = highlight === "lowest" ? Math.min(...valid) : Math.max(...valid);
      bestIdx = nums.indexOf(best);
    }
  }

  return (
    <div className="compare-row">
      <div className="compare-label">{label}</div>
      {values.map((val, i) => (
        <div key={i} className={`compare-cell ${bestIdx === i ? "compare-cell--winner" : ""}`}>
          {bestIdx === i && <Trophy className="w-3 h-3 text-warning inline mr-1" />}
          {val || <Minus className="w-3 h-3 text-muted-foreground" />}
        </div>
      ))}
      {/* Fill empty columns */}
      {Array.from({ length: 3 - values.length }).map((_, i) => (
        <div key={`empty-${i}`} className="compare-cell text-muted-foreground">—</div>
      ))}
    </div>
  );
}

export default function Compare() {
  const [params] = useSearchParams();
  const ids = useMemo(() => (params.get("ids") || "").split(",").filter(Boolean).slice(0, 3), [params]);

  const queries = ids.map((id) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: ["car", id],
      queryFn: () => getCarById(id),
      staleTime: 120_000,
    })
  );

  const cars: (NormalizedCar | null)[] = queries.map((q) =>
    q.data ? normalizeCar(q.data) : null
  );
  const loading = queries.some((q) => q.isLoading);

  return (
    <Layout>
      <div className="container py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Compare Vehicles</h1>
            <p className="text-sm text-muted-foreground">Side-by-side comparison of {ids.length} vehicles</p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-4 gap-4">
            <div />
            {ids.map((id) => (
              <div key={id} className="animate-pulse space-y-3">
                <div className="aspect-[16/10] bg-muted rounded-xl" />
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="compare-table">
            {/* Header: car images + titles */}
            <div className="compare-row compare-row--header">
              <div className="compare-label" />
              {cars.map((car, i) =>
                car ? (
                  <div key={car.id} className="compare-cell flex flex-col items-center gap-2">
                    <Link to={`/cars/${car.id}`} className="group">
                      {car.imageUrl ? (
                        <img
                          src={car.imageUrl}
                          alt={car.title}
                          className="w-full aspect-[16/10] object-cover rounded-xl border border-border group-hover:shadow-lg transition-shadow"
                        />
                      ) : (
                        <div className="w-full aspect-[16/10] bg-muted rounded-xl flex items-center justify-center text-xs text-muted-foreground">No Photo</div>
                      )}
                      <h3 className="text-sm font-semibold mt-2 text-center group-hover:text-primary transition-colors line-clamp-2">{car.title}</h3>
                    </Link>
                  </div>
                ) : (
                  <div key={i} className="compare-cell text-muted-foreground text-sm">Loading…</div>
                )
              )}
              {Array.from({ length: 3 - cars.length }).map((_, i) => (
                <div key={`empty-${i}`} className="compare-cell" />
              ))}
            </div>

            {/* Data rows */}
            <CompareRow
              label="Price"
              values={cars.map((c) => c ? formatPrice(c.price, c.currency) : null)}
              highlight="lowest"
            />
            <CompareRow
              label="Mileage"
              values={cars.map((c) => c ? formatMileage(c.mileage) : null)}
              highlight="lowest"
            />
            <CompareRow
              label="Year"
              values={cars.map((c) => c?.year ? String(c.year) : null)}
              highlight="highest"
            />
            <CompareRow label="Make" values={cars.map((c) => c?.make || null)} />
            <CompareRow label="Model" values={cars.map((c) => c?.model || null)} />
            <CompareRow label="Trim" values={cars.map((c) => c?.trim || null)} />
            <CompareRow label="Transmission" values={cars.map((c) => c?.transmission || null)} />
            <CompareRow label="Engine" values={cars.map((c) => c?.engine || null)} />
            <CompareRow label="Exterior Color" values={cars.map((c) => c?.exteriorColor || null)} />
            <CompareRow label="Location" values={cars.map((c) => c?.location || null)} />
            <CompareRow label="VIN" values={cars.map((c) => c?.vin || null)} />
            <CompareRow label="Source" values={cars.map((c) => c?.source || null)} />
            <CompareRow
              label="Estimated Value"
              values={cars.map((c) => c?.estimatedValue || (c?.estimatedValueNumber ? formatPrice(c.estimatedValueNumber, c.currency) : null))}
            />
            <CompareRow
              label="Likes"
              values={cars.map((c) => c ? String(c.likes ?? 0) : null)}
              highlight="highest"
            />

            {/* View on source links */}
            <div className="compare-row">
              <div className="compare-label" />
              {cars.map((car) =>
                car?.url && car.url !== "#" ? (
                  <div key={car.id} className="compare-cell">
                    <a
                      href={car.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" /> View listing
                    </a>
                  </div>
                ) : (
                  <div key={car?.id || Math.random()} className="compare-cell" />
                )
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
