import { useState } from "react";
import { ChevronDown, X, Search, DollarSign, Calendar, Car as CarIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { SearchFilters } from "@/hooks/useSearchFilters";

interface FilterPanelProps {
  filters: SearchFilters;
  onFilterChange: (update: Partial<SearchFilters>) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}

const POPULAR_MAKES = [
  "Porsche", "BMW", "Mercedes-Benz", "Ferrari", "Lamborghini",
  "Audi", "Toyota", "Ford", "Chevrolet", "McLaren",
  "Aston Martin", "Jaguar", "Land Rover", "Nissan", "Honda",
];

const YEAR_PRESETS = [
  { label: "2020+", min: 2020, max: undefined },
  { label: "2010–2019", min: 2010, max: 2019 },
  { label: "2000–2009", min: 2000, max: 2009 },
  { label: "Pre-2000", min: undefined, max: 1999 },
];

const PRICE_PRESETS = [
  { label: "Under $25k", min: undefined, max: 25000 },
  { label: "$25k–$50k", min: 25000, max: 50000 },
  { label: "$50k–$100k", min: 50000, max: 100000 },
  { label: "$100k–$250k", min: 100000, max: 250000 },
  { label: "$250k+", min: 250000, max: undefined },
];

const TRANSMISSIONS = ["Manual", "Automatic"];

export default function FilterPanel({ filters, onFilterChange, onClear, hasActiveFilters }: FilterPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const activeCount = [
    filters.make, filters.model, filters.yearMin, filters.yearMax,
    filters.priceMin, filters.priceMax, filters.transmission,
  ].filter(v => v != null && v !== "").length;

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="filter-chip flex items-center gap-1.5"
      >
        <Search className="w-3.5 h-3.5" />
        Advanced Filters
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
            {activeCount}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-card border border-border rounded-xl p-5 space-y-5">
              {/* Row 1: Make + Model text inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <CarIcon className="w-3 h-3" /> Make
                  </label>
                  <input
                    type="text"
                    value={filters.make || ""}
                    onChange={(e) => onFilterChange({ make: e.target.value || undefined })}
                    placeholder="e.g. Porsche"
                    className="filter-input"
                    maxLength={50}
                  />
                  <div className="flex flex-wrap gap-1 mt-1">
                    {POPULAR_MAKES.slice(0, 5).map(m => (
                      <button
                        key={m}
                        onClick={() => onFilterChange({ make: filters.make === m ? undefined : m })}
                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                          filters.make === m
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Model</label>
                  <input
                    type="text"
                    value={filters.model || ""}
                    onChange={(e) => onFilterChange({ model: e.target.value || undefined })}
                    placeholder="e.g. 911"
                    className="filter-input"
                    maxLength={50}
                  />
                </div>

                {/* Year range */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Year
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={filters.yearMin || ""}
                      onChange={(e) => onFilterChange({ yearMin: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="From"
                      className="filter-input w-full"
                      min={1900}
                      max={2030}
                    />
                    <span className="text-muted-foreground text-xs">–</span>
                    <input
                      type="number"
                      value={filters.yearMax || ""}
                      onChange={(e) => onFilterChange({ yearMax: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="To"
                      className="filter-input w-full"
                      min={1900}
                      max={2030}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {YEAR_PRESETS.map(p => {
                      const active = filters.yearMin === p.min && filters.yearMax === p.max;
                      return (
                        <button
                          key={p.label}
                          onClick={() => onFilterChange({
                            yearMin: active ? undefined : p.min,
                            yearMax: active ? undefined : p.max,
                          })}
                          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Price range */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> Price
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={filters.priceMin || ""}
                      onChange={(e) => onFilterChange({ priceMin: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="Min"
                      className="filter-input w-full"
                      min={0}
                    />
                    <span className="text-muted-foreground text-xs">–</span>
                    <input
                      type="number"
                      value={filters.priceMax || ""}
                      onChange={(e) => onFilterChange({ priceMax: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="Max"
                      className="filter-input w-full"
                      min={0}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {PRICE_PRESETS.map(p => {
                      const active = filters.priceMin === p.min && filters.priceMax === p.max;
                      return (
                        <button
                          key={p.label}
                          onClick={() => onFilterChange({
                            priceMin: active ? undefined : p.min,
                            priceMax: active ? undefined : p.max,
                          })}
                          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Row 2: Transmission */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Transmission:</span>
                {TRANSMISSIONS.map(t => (
                  <button
                    key={t}
                    onClick={() => onFilterChange({ transmission: filters.transmission === t ? undefined : t })}
                    className={`filter-chip text-xs !py-1.5 ${filters.transmission === t ? "active" : ""}`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Clear */}
              {hasActiveFilters && (
                <button
                  onClick={onClear}
                  className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 font-medium transition-colors"
                >
                  <X className="w-3 h-3" /> Clear all filters
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
