import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import CarCard from "@/components/CarCard";
import CarCardSkeleton from "@/components/CarCardSkeleton";
import { useFavorites } from "@/hooks/useFavorites";
import { getCarById } from "@/lib/api";
import { normalizeCar } from "@/lib/normalizeCar";
import { ArrowLeft, Heart } from "lucide-react";

export default function Favorites() {
  const { favorites, count } = useFavorites();

  const queries = useQueries({
    queries: favorites.map((id) => ({
      queryKey: ["car", id],
      queryFn: () => getCarById(id),
      staleTime: 120_000,
    })),
  });

  const cars = useMemo(
    () => queries.filter((q) => q.data).map((q) => normalizeCar(q.data)),
    [queries]
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
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Heart className="w-5 h-5 text-destructive" fill="currentColor" />
              My Favorites
            </h1>
            <p className="text-sm text-muted-foreground">{count} saved vehicle{count !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {count === 0 ? (
          <div className="text-center py-20 space-y-3">
            <Heart className="w-12 h-12 mx-auto text-muted-foreground/30" />
            <p className="text-lg font-medium text-muted-foreground">No favorites yet</p>
            <p className="text-sm text-muted-foreground">
              Tap the heart icon on any car to save it here
            </p>
            <Link to="/" className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              Browse Cars
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {loading && cars.length === 0
              ? Array.from({ length: count }).map((_, i) => <CarCardSkeleton key={i} />)
              : cars.map((car, i) => <CarCard key={car.id} car={car} index={i} />)
            }
          </div>
        )}
      </div>
    </Layout>
  );
}
