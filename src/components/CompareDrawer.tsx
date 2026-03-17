import { useCompare } from "@/hooks/useCompare";
import { formatPrice, formatMileage } from "@/lib/normalizeCar";
import { X, ArrowRight, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";

export default function CompareDrawer() {
  const { compareIds, getCompareCars, clearCompare, toggleCompare, count } = useCompare();
  const navigate = useNavigate();
  const cars = getCompareCars();

  if (count === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-0 left-0 right-0 z-50 compare-drawer"
      >
        <div className="container py-3">
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide">
            {/* Car thumbnails */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {cars.map((car) => (
                <div
                  key={car.id}
                  className="compare-drawer-card"
                >
                  {car.imageUrl ? (
                    <img src={car.imageUrl} alt={car.title} className="w-12 h-12 rounded-md object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-md bg-muted flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate text-foreground">{car.title}</p>
                    <p className="text-[11px] text-muted-foreground">{formatPrice(car.price, car.currency)}</p>
                  </div>
                  <button
                    onClick={() => toggleCompare(car.id)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                    aria-label={`Remove ${car.title} from compare`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Empty slots */}
              {Array.from({ length: 3 - count }).map((_, i) => (
                <div key={`empty-${i}`} className="compare-drawer-empty">
                  <span className="text-[10px] text-muted-foreground">+ Add</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-medium text-muted-foreground">{count}/3</span>
              <button
                onClick={() => navigate(`/compare?ids=${compareIds.join(",")}`)}
                disabled={count < 2}
                className="compare-drawer-btn"
              >
                Compare <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={clearCompare}
                className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Clear compare"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
