import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { formatPrice, formatMileage, formatCountdown } from "@/lib/normalizeCar";
import type { NormalizedCar } from "@/lib/normalizeCar";

const SPEC_KEYS: [string, string, ((car: NormalizedCar) => string | null)?][] = [
  ["Year", "year"],
  ["Make", "make"],
  ["Model", "model"],
  ["Trim", "trim"],
  ["Engine", "engine"],
  ["Transmission", "transmission"],
  ["Drivetrain", "drivetrain"],
  ["Exterior Color", "exteriorColor"],
  ["Interior Color", "interior_color"],
  ["Mileage", "mileage", (car) => car.mileage != null ? formatMileage(car.mileage) : null],
  ["Price", "price", (car) => car.price != null ? formatPrice(car.price, car.currency) : null],
  ["Currency", "currency"],
  ["Location", "location"],
  ["Ends", "endTime", (car) => car.endTime ? formatCountdown(car.endTime) : null],
  ["VIN", "vin"],
];

interface SpecGridProps {
  car: NormalizedCar;
}

export default function SpecGrid({ car }: SpecGridProps) {
  const [vinCopied, setVinCopied] = useState(false);

  const handleCopyVin = useCallback(async () => {
    if (!car.vin) return;
    try {
      await navigator.clipboard.writeText(car.vin);
      setVinCopied(true);
      toast.success("VIN copied to clipboard");
      setTimeout(() => setVinCopied(false), 2000);
    } catch {
      toast.error("Unable to copy VIN");
    }
  }, [car.vin]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {SPEC_KEYS.map(([label, key, formatter]) => {
        const value = formatter
          ? formatter(car)
          : (car as any)[key];

        if (!value || value === "null" || value === "None" || value === "") return null;

        const isVin = key === "vin";
        const isPrice = key === "price";
        const isEnding = key === "endTime";

        return (
          <div
            key={key}
            className={`p-3 rounded-xl bg-background border border-border ${
              isPrice ? "col-span-2 md:col-span-1" : ""
            }`}
          >
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {label}
            </span>
            <div className={`text-sm font-semibold mt-0.5 flex items-center gap-1.5 ${
              isPrice ? "text-primary text-base" : ""
            } ${isEnding ? "text-warning" : ""}`}>
              {String(value)}
              {isVin && (
                <button
                  onClick={handleCopyVin}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  title="Copy VIN"
                >
                  {vinCopied ? (
                    <Check className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
