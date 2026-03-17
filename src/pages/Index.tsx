import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import CarCard from "@/components/CarCard";
import CarCardSkeleton from "@/components/CarCardSkeleton";
import FilterPanel from "@/components/FilterPanel";
import DiscoverDrawer from "@/components/DiscoverDrawer";
import Footer from "@/components/Footer";
import ScrollToTop from "@/components/ScrollToTop";
import { getCars } from "@/lib/api";
import { normalizeCar } from "@/lib/normalizeCar";

import { useSearchFilters } from "@/hooks/useSearchFilters";
import { useDebounce } from "@/hooks/useDebounce";
import { useGeolocation } from "@/hooks/useGeolocation";
import {
  TrendingUp, Car as CarIcon, Gavel, Gamepad2,
  SlidersHorizontal, ChevronDown,
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
  const { coords: geoCoords, loading: geoLoading, error: geoError, zipMode, requestLocation, setFromZip } = useGeolocation();
  const [zipInput, setZipInput] = useState("");

  // Sticky search state
  const [scrolledPastHero, setScrolledPastHero] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const heroBottom = heroRef.current?.getBoundingClientRect().bottom ?? 0;
      setScrolledPastHero(heroBottom < 56); // 56 = header height
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const PAGE_SIZE = 24;
  const sort = filters.sort || "relevance";
  const debouncedFilters = useDebounce(filters, 400);

  useEffect(() => {
    if (sort === "nearest" && !geoCoords && !geoLoading) {
      requestLocation();
    }
  }, [sort, geoCoords, geoLoading, requestLocation]);

  const queryKey = useMemo(
    () => ["cars", debouncedFilters, geoCoords],
    [debouncedFilters, geoCoords]
  );

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ signal, pageParam = 1 }) => {
      const rawSort = debouncedFilters.sort || "relevance";
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
        { page: pageParam as number, pageSize: PAGE_SIZE },
        signal
      );
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage) return undefined;
      const loaded = allPages.length * PAGE_SIZE;
      return loaded < (lastPage.total ?? 0) ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
    staleTime: 60000,
    retry: 1,
    enabled: true,
  });

  const rawCars = useMemo(() => {
    if (!data) return [];
    return data.pages.flatMap((page) => page.items.map((r: any) => normalizeCar(r)));
  }, [data]);

  const totalCount = data?.pages[0]?.total ?? rawCars.length;
  const currentSort = sortOptions.find(s => s.value === sort);

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
  const [stickySearch, setStickySearch] = useState(filters.q || "");

  const handleHeroSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ q: heroSearch.trim() || undefined, page: undefined });
    setStickySearch(heroSearch);
  }, [heroSearch, setFilters]);

  const handleStickySearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ q: stickySearch.trim() || undefined, page: undefined });
    setHeroSearch(stickySearch);
  }, [stickySearch, setFilters]);


  return (
    <Layout>
      {/* ── HERO ── */}
      <section ref={heroRef} className="relative overflow-hidden">
        {/* Background with parallax-style layering */}
        <div className="absolute inset-0">
          <img src={heroBg} alt="" className="w-full h-full object-cover scale-105" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-background" />
        </div>

        <div className="relative z-10 container py-10 md:py-14 flex flex-col items-center text-center gap-6">
          {/* Logo + wordmark */}
          <div className="flex flex-col items-center gap-4">
            <img
              src="https://cdn.vinfreak.com/branding/VCzgNThhX13rCP1Yu8pTwg.png"
              alt="VINFREAK"
              className="h-28 md:h-36 lg:h-44 w-auto object-contain mix-blend-lighten drop-shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
            />
            <div className="flex items-center gap-3">
              <div className="h-px w-10 bg-gradient-to-r from-transparent to-white/30" />
              <span className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.35em] text-white/50">
                Exotic Car Intelligence
              </span>
              <div className="h-px w-10 bg-gradient-to-l from-transparent to-white/30" />
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white/90 max-w-lg leading-snug">
            Find, compare & track exotics across{" "}
            <span className="text-primary">every marketplace</span>
          </h1>

          {/* Search */}
          <form onSubmit={handleHeroSearch} className="w-full max-w-lg">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
                placeholder="Search make, model, year..."
                className="w-full pl-11 pr-24 py-3 rounded-xl bg-white/8 backdrop-blur-xl border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/30 focus:bg-white/12 transition-all shadow-2xl"
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

          {/* Live stats pill */}
          <div className="flex items-center gap-3 text-[10px] text-white/40 font-medium">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              Live
            </span>
            <span>Auctions · Dealers · FB Marketplace · Private Sellers</span>
          </div>
        </div>
      </section>

      {/* ── DISCOVER DRAWER (Trending + Recently Viewed) ── */}
      <DiscoverDrawer />

      {/* ── STICKY SEARCH BAR ── */}
      {scrolledPastHero && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky-search"
        >
          <div className="container py-2.5">
            <form onSubmit={handleStickySearch} className="flex items-center gap-2 max-w-2xl mx-auto">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={stickySearch}
                  onChange={(e) => setStickySearch(e.target.value)}
                  placeholder="Search make, model, year..."
                  className="w-full pl-9 pr-4 py-2 rounded-lg text-sm bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
                  maxLength={100}
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all"
              >
                Search
              </button>
            </form>
          </div>
        </motion.div>
      )}

      <div className="container py-8 space-y-6">

        {/* Results count */}
        {/* Sort */}
        <div className="flex items-center gap-2 flex-wrap overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
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

          {(isLoading || geoLoading) && <Loader2 className="w-4 h-4 animate-spin text-primary ml-2" />}
          {sort === "nearest" && (
            <div className="w-full mt-3 rounded-lg border border-border bg-card p-3 sm:p-4">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Cars near you</span>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (zipInput.trim()) setFromZip(zipInput.trim());
                }}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
              >
                <input
                  type="text"
                  inputMode="numeric"
                  value={zipInput}
                  onChange={(e) => setZipInput(e.target.value)}
                  placeholder="Enter ZIP code"
                  className="flex-1 px-3 py-2.5 sm:py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  maxLength={10}
                />
                <button
                  type="submit"
                  disabled={geoLoading}
                  className="px-4 py-2.5 sm:py-2 text-sm rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {geoLoading ? "Updating…" : "Update ZIP code"}
                </button>
              </form>
              {geoError && (
                <p className="text-[11px] text-destructive mt-1.5">{geoError}</p>
              )}
              {!geoCoords && !geoError && !geoLoading && (
                <p className="text-[11px] text-muted-foreground mt-1.5">Enter a ZIP to sort by distance, or browse recent listings below.</p>
              )}
            </div>
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

        {/* Car grid - show skeletons while loading */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {isLoading
            ? Array.from({ length: 12 }).map((_, i) => <CarCardSkeleton key={i} />)
            : rawCars.map((car: any, i: number) => (
                <CarCard key={car.id} car={car} index={i} />
              ))
          }
        </div>

        {rawCars.length === 0 && !isLoading && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg font-medium">No vehicles match your filters</p>
            <p className="text-sm mt-1">Try adjusting your search or removing filters</p>
          </div>
        )}

        {/* Load More */}
        {hasNextPage && (
          <div className="flex flex-col items-center gap-2 py-8">
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-lg"
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </>
              ) : (
                "Load More"
              )}
            </button>
            <span className="text-xs text-muted-foreground">
              {rawCars.length} of {totalCount.toLocaleString()} vehicles
            </span>
          </div>
        )}
      </div>

      <Footer />
      <ScrollToTop />
    </Layout>
  );
}
