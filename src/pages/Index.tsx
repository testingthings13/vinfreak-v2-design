import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import CarCard from "@/components/CarCard";
import FilterPanel from "@/components/FilterPanel";
import { getCars } from "@/lib/api";
import { normalizeCar } from "@/lib/normalizeCar";
import { mockCars } from "@/data/mockCars";
import { useSearchFilters } from "@/hooks/useSearchFilters";
import { useDebounce } from "@/hooks/useDebounce";
import { useGeolocation } from "@/hooks/useGeolocation";
import {
  TrendingUp, Car as CarIcon, Gavel, Gamepad2,
  SlidersHorizontal, ChevronDown, ChevronLeft, ChevronRight,
  Loader2, ArrowUpDown, ArrowDown, ArrowUp, Calendar,
  Gauge, X, MapPin, Clock, Search,
} from "lucide-react";
import { motion } from "framer-motion";
import heroBg from "@/assets/hero-bg.jpg";

const sortOptions = [
  { value: "relevance", label: "Recommended", desc: "Highlights listings that are trending and relevant to you.", icon: TrendingUp },
  { value: "recent", label: "New Listings", desc: "Shows the newest inventory updates first.", icon: Calendar },
  { value: "nearest", label: "Nearest to Me", desc: "Cars closest to this area appear first.", icon: MapPin },
  { value: "pca", label: "PCA", desc: "Shows PCA listings only.", icon: CarIcon },
  { value: "facebook_marketplace", label: "FB Marketplace", desc: "Shows FB Marketplace listings only.", icon: CarIcon },
  { value: "manual", label: "Manual Transmission", desc: "Prioritizes listings with manual gearboxes.", icon: Gamepad2 },
  { value: "end_time_asc", label: "Auctions Ending Soonest", desc: "Auctions with the least time remaining rise to the top.", icon: Clock },
  { value: "price_desc", label: "Price: High to Low", desc: "Start with the most premium builds on the market.", icon: ArrowDown },
  { value: "price_asc", label: "Price: Low to High", desc: "Great for spotting entry-level deals first.", icon: ArrowUp },
  { value: "year_desc", label: "Year: Newest First", desc: "Showcases the latest model years up top.", icon: Calendar },
  { value: "year_asc", label: "Year: Oldest First", desc: "Perfect when you're searching for classics.", icon: Calendar },
  { value: "mileage_asc", label: "Mileage: Low to High", desc: "Puts the lowest odometer readings front and center.", icon: Gauge },
  { value: "mileage_desc", label: "Mileage: High to Low", desc: "Ideal for finding well-traveled drivers first.", icon: Gauge },
];

export default function Index() {
  const { filters, setFilters, clearFilters, hasActiveFilters } = useSearchFilters();
  const [showSort, setShowSort] = useState(false);
  const { coords: geoCoords, loading: geoLoading, error: geoError, requestLocation } = useGeolocation();

  const PAGE_SIZE = 24;
  const sort = filters.sort || "relevance";
  const page = filters.page || 1;
  const debouncedFilters = useDebounce(filters, 400);
  const debouncedPage = debouncedFilters.page || 1;

  // Auto-request geolocation when user selects "nearest"
  useEffect(() => {
    if (sort === "nearest" && !geoCoords && !geoLoading) {
      requestLocation();
    }
  }, [sort, geoCoords, geoLoading, requestLocation]);

  const queryKey = useMemo(
    () => ["cars", debouncedFilters, geoCoords],
    [debouncedFilters, geoCoords]
  );

  const { data: apiResult, isLoading, isError } = useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      const rawSort = debouncedFilters.sort || "relevance";

      // Map UI sort values to API sort + source params (matching V1 behavior)
      let apiSort = rawSort;
      let apiSource = debouncedFilters.source;
      let lat: number | undefined;
      let lng: number | undefined;

      if (rawSort === "facebook_marketplace") {
        apiSort = "recent";
        apiSource = "facebook_marketplace";
      } else if (rawSort === "pca") {
        apiSort = "recent";
        apiSource = "pca";
      } else if (rawSort === "manual") {
        apiSort = "recent";
      } else if (rawSort === "nearest") {
        if (geoCoords) {
          lat = geoCoords.lat;
          lng = geoCoords.lng;
        } else {
          // No coords yet, fall back to recent
          apiSort = "recent";
        }
      }

      return getCars(
        {
          q: debouncedFilters.q,
          make: debouncedFilters.make,
          model: debouncedFilters.model,
          yearMin: debouncedFilters.yearMin,
          yearMax: debouncedFilters.yearMax,
          priceMin: debouncedFilters.priceMin,
          priceMax: debouncedFilters.priceMax,
          transmission: rawSort === "manual" ? "Manual" : debouncedFilters.transmission,
          source: apiSource,
          sort: apiSort,
          saleType: debouncedFilters.saleType,
          lat,
          lng,
        },
        { page: debouncedPage, pageSize: PAGE_SIZE },
        signal
      );
    },
    staleTime: 60000,
    retry: 1,
    // Don't fetch nearest until we have coords
    enabled: sort !== "nearest" || !!geoCoords,
  });

  const rawCars = apiResult
    ? apiResult.items.map((r: any) => normalizeCar(r))
    : (isError ? mockCars.map((r: any) => normalizeCar(r)) : []);

  const totalCount = apiResult?.total ?? rawCars.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const liveAuctionCount = rawCars.filter((c: any) => c.auctionStatus === "AUCTION_IN_PROGRESS").length;
  const currentSort = sortOptions.find(s => s.value === sort);

  const goToPage = useCallback((p: number) => {
    const clamped = Math.max(1, Math.min(p, totalPages));
    setFilters({ page: clamped === 1 ? undefined : clamped });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [totalPages, setFilters]);

  // Active filter summary chips
  const filterSummary = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (filters.q) chips.push({ key: "q", label: `"${filters.q}"` });
    if (filters.make) chips.push({ key: "make", label: filters.make });
    if (filters.model) chips.push({ key: "model", label: filters.model });
    if (filters.yearMin || filters.yearMax) {
      chips.push({ key: "year", label: `${filters.yearMin || "Any"}–${filters.yearMax || "Any"} yr` });
    }
    if (filters.priceMin || filters.priceMax) {
      const fmt = (n?: number) => n ? `$${(n / 1000).toFixed(0)}k` : "Any";
      chips.push({ key: "price", label: `${fmt(filters.priceMin)}–${fmt(filters.priceMax)}` });
    }
    if (filters.transmission) chips.push({ key: "transmission", label: filters.transmission });
    return chips;
  }, [filters]);

  const removeFilter = (key: string) => {
    if (key === "year") setFilters({ yearMin: undefined, yearMax: undefined });
    else if (key === "price") setFilters({ priceMin: undefined, priceMax: undefined });
    else setFilters({ [key]: undefined });
  };

  const [heroSearch, setHeroSearch] = useState(filters.q || "");

  const handleHeroSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ q: heroSearch.trim() || undefined, page: undefined });
  }, [heroSearch, setFilters]);

  return (
    <Layout>
      {/* ── HERO ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBg} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/80" />
        </div>

        <div className="relative z-10 container py-14 md:py-20 flex flex-col items-center text-center gap-5">
          <img
            src="https://cdn.vinfreak.com/branding/VCzgNThhX13rCP1Yu8pTwg.png"
            alt="VINFREAK"
            className="h-24 md:h-32 w-auto object-contain drop-shadow-2xl"
          />

          <div className="max-w-2xl space-y-2">
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-white drop-shadow-lg">
              Find Your Next Exotic
            </h1>
            <p className="text-white/70 text-sm md:text-base font-medium">
              AI-powered search across auctions, dealers & marketplaces worldwide
            </p>
          </div>

          {/* Search bar */}
          <form onSubmit={handleHeroSearch} className="w-full max-w-xl">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
                placeholder="Search make, model, year..."
                className="w-full pl-11 pr-24 py-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/40 focus:bg-white/15 transition-all shadow-xl"
                maxLength={100}
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-lg"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </section>

      <div className="container py-8 space-y-6">

        {/* Sort + quick filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />

          <div className="relative">
            <button onClick={() => setShowSort(!showSort)} className="filter-chip flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" />
              Sort: {currentSort?.label || "Recommended"}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showSort && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-xl py-1 z-20 min-w-[320px] max-h-[400px] overflow-y-auto"
              >
                {sortOptions.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => { setFilters({ sort: opt.value }); setShowSort(false); }}
                      className={`flex items-start gap-3 w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors ${sort === opt.value ? "text-primary font-medium bg-primary/5" : "text-foreground"}`}
                    >
                      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">Sort by: {opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </div>

          <button
            onClick={() => setFilters({ saleType: filters.saleType === "auction" ? undefined : "auction" })}
            className={`filter-chip ${filters.saleType === "auction" ? "active" : ""}`}
          >
            <Gavel className="w-3.5 h-3.5" /> Auction
          </button>
          <button
            onClick={() => setFilters({ transmission: filters.transmission === "Manual" ? undefined : "Manual" })}
            className={`filter-chip ${filters.transmission === "Manual" ? "active" : ""}`}
          >
            <Gamepad2 className="w-3.5 h-3.5" /> Manual
          </button>
          <button
            onClick={() => setFilters({ source: filters.source === "facebook_marketplace" ? undefined : "facebook_marketplace" })}
            className={`filter-chip ${filters.source === "facebook_marketplace" ? "active" : ""}`}
          >
            <span className="w-3.5 h-3.5 rounded bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center">F</span>
            FB Marketplace
          </button>

          {(isLoading || geoLoading) && <Loader2 className="w-4 h-4 animate-spin text-primary ml-2" />}
          {geoLoading && sort === "nearest" && (
            <span className="text-xs text-muted-foreground ml-1">Getting your location…</span>
          )}
          {geoError && sort === "nearest" && (
            <span className="text-xs text-destructive ml-1">{geoError}</span>
          )}
        </div>

        {/* Advanced filter panel */}
        <FilterPanel
          filters={filters}
          onFilterChange={setFilters}
          onClear={clearFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {/* Active filter chips */}
        {filterSummary.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">Active:</span>
            {filterSummary.map(chip => (
              <span key={chip.key} className="active-filter-chip">
                {chip.label}
                <button onClick={() => removeFilter(chip.key)} className="ml-1 hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              onClick={clearFilters}
              className="text-xs text-destructive hover:text-destructive/80 font-medium ml-1"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Car grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {rawCars.map((car: any, i: number) => (
            <CarCard key={car.id} car={car} index={i} />
          ))}
        </div>

        {rawCars.length === 0 && !isLoading && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg font-medium">No vehicles match your filters</p>
            <p className="text-sm mt-1">Try adjusting your search or removing filters</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-8">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>

            {(() => {
              const pages: (number | "...")[] = [];
              if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                if (page > 3) pages.push("...");
                for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
                if (page < totalPages - 2) pages.push("...");
                pages.push(totalPages);
              }
              return pages.map((p, idx) =>
                p === "..." ? (
                  <span key={`e${idx}`} className="px-2 text-muted-foreground text-sm">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                      p === page
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card hover:bg-muted"
                    }`}
                  >
                    {p}
                  </button>
                )
              );
            })()}

            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>

            <span className="ml-3 text-xs text-muted-foreground">
              Page {page} of {totalPages} · {totalCount} results
            </span>
          </div>
        )}
      </div>
    </Layout>
  );
}
