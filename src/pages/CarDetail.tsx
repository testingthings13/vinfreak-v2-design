import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCarById, getComments } from "@/lib/api";
import { mockCars, formatPrice, sourceLabels, timeAgo, formatCountdown } from "@/data/mockCars";
import Layout from "@/components/Layout";
import { ArrowLeft, ExternalLink, Bookmark, Share2, MapPin, Clock, ThumbsUp, MessageCircle, Calendar, Gauge, Settings, Palette, Sparkles, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

function normalizeCar(raw: any) {
  return {
    id: String(raw.id),
    title: raw.title || `${raw.year || ""} ${raw.make || ""} ${raw.model || ""}`.trim(),
    make: raw.make || "",
    model: raw.model || "",
    year: raw.year || 0,
    price: raw.price ?? null,
    currency: raw.currency || "USD",
    mileage: raw.mileage ?? null,
    transmission: raw.transmission || "",
    exterior_color: raw.exterior_color || raw.color || "",
    engine: raw.engine || "",
    vin: raw.vin || "",
    source: raw.source || "",
    url: raw.url || "#",
    image_url: raw.image_url || raw.images?.[0] || "",
    images: raw.images || (raw.image_url ? [raw.image_url] : []),
    auction_status: raw.auction_status || raw.status || "LIVE",
    auction_end_time: raw.auction_end_time || raw.end_time || null,
    current_bid: raw.current_bid ?? null,
    bid_count: raw.bid_count ?? 0,
    comment_count: raw.comment_count ?? 0,
    location: raw.location || [raw.city, raw.state].filter(Boolean).join(", ") || "",
    dealership_name: raw.dealership_name || null,
    description: raw.description || "",
    specs: raw.specs || {},
    posted_at: raw.posted_at || raw.created_at || new Date().toISOString(),
    likes: raw.likes ?? raw.like_count ?? 0,
    price_label: raw.auction_status === "AUCTION_IN_PROGRESS" ? "Current Bid" : "Buy Now",
  };
}

export default function CarDetail() {
  const { id } = useParams();
  const [selectedImage, setSelectedImage] = useState(0);

  const { data: apiCar, isLoading } = useQuery({
    queryKey: ["car", id],
    queryFn: () => getCarById(id!),
    enabled: !!id,
    retry: 1,
  });

  // Normalize API car or fallback to mock
  const car = apiCar
    ? normalizeCar(apiCar)
    : mockCars.find((c) => c.id === id);

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-20 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!car) {
    return (
      <Layout>
        <div className="container py-20 text-center">
          <h1 className="text-3xl font-bold mb-4">Vehicle Not Found</h1>
          <Link to="/" className="text-primary hover:underline">← Back to listings</Link>
        </div>
      </Layout>
    );
  }

  const isAuction = car.auction_status === "AUCTION_IN_PROGRESS";
  const isSold = car.auction_status === "SOLD";

  const quickSpecs = [
    { icon: Calendar, label: "Year", value: car.year.toString() },
    { icon: Gauge, label: "Mileage", value: car.mileage ? `${car.mileage.toLocaleString()} mi` : "N/A" },
    { icon: Settings, label: "Trans.", value: car.transmission },
    { icon: Palette, label: "Color", value: car.exterior_color },
  ];

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <span>/</span>
          <span className="text-foreground truncate">{car.title}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="relative aspect-[16/10] rounded-xl overflow-hidden bg-card border border-border">
              <img src={car.images[selectedImage] || car.image_url} alt={car.title} className="w-full h-full object-cover" />
              <div className="absolute top-3 left-3 flex items-center gap-2">
                {car.auction_status === "LIVE" && <span className="badge-for-sale">FOR SALE</span>}
                {isAuction && <span className="badge-auction"><Clock className="w-3 h-3" /> AUCTION</span>}
                {isSold && <span className="badge-sold">SOLD</span>}
              </div>
              <span className="absolute bottom-3 left-3 badge-source">{sourceLabels[car.source] || car.source}</span>
              {isAuction && car.auction_end_time && (
                <span className="absolute top-3 right-3 text-xs font-semibold text-card bg-foreground/70 backdrop-blur-sm px-2 py-1 rounded-md">
                  {formatCountdown(car.auction_end_time)}
                </span>
              )}
            </motion.div>

            {car.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                {car.images.map((img: string, i: number) => (
                  <button key={i} onClick={() => setSelectedImage(i)}
                    className={`flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-colors ${i === selectedImage ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"}`}>
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            <div className="bg-card rounded-xl border border-border p-6 space-y-3">
              <h2 className="font-semibold text-lg">Description</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{car.description || "No description available."}</p>
            </div>

            {Object.keys(car.specs).length > 0 && (
              <div className="bg-card rounded-xl border border-border p-6 space-y-3">
                <h2 className="font-semibold text-lg">Specifications</h2>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(car.specs).map(([key, value]) => (
                    <div key={key} className="flex justify-between p-3 rounded-lg bg-background">
                      <span className="text-sm text-muted-foreground">{key}</span>
                      <span className="text-sm font-semibold">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-card rounded-xl border border-border p-6 space-y-4 sticky top-20">
              <h1 className="font-bold text-lg leading-snug">{car.title}</h1>
              {car.engine && <p className="text-sm text-muted-foreground">{car.engine}</p>}
              <hr className="border-border" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                  {isAuction ? "Current Bid" : isSold ? "Sold For" : "Price"}
                </p>
                <p className="text-3xl font-bold">
                  {isAuction && car.current_bid ? formatPrice(car.current_bid) : formatPrice(car.price)}
                </p>
                {isAuction && <p className="text-sm text-muted-foreground">{car.bid_count} bids</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {quickSpecs.map((s) => (
                  <div key={s.label} className="flex flex-col items-center p-3 rounded-lg bg-background text-center">
                    <s.icon className="w-4 h-4 text-muted-foreground mb-1" />
                    <span className="text-[10px] text-muted-foreground">{s.label}</span>
                    <span className="text-xs font-semibold">{s.value}</span>
                  </div>
                ))}
              </div>
              <hr className="border-border" />
              {car.location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4" /> {car.location}
                </div>
              )}
              {car.dealership_name && (
                <div className="px-3 py-2 rounded-lg bg-background text-sm">
                  <span className="text-muted-foreground">Dealer:</span> <span className="font-medium">{car.dealership_name}</span>
                </div>
              )}
              {!isSold && (
                <a href={car.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
                  {isAuction ? "Place Bid" : "View Listing"} <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">
                  <Bookmark className="w-4 h-4" /> Save
                </button>
                <button className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">
                  <Share2 className="w-4 h-4" /> Share
                </button>
              </div>
              <button className="freakstats-btn">
                <Sparkles className="w-4 h-4" />
                <span className="font-semibold text-xs">AI</span>
                Get insights with FREAKStats
              </button>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> {car.likes}</span>
                <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {car.comment_count}</span>
                <span>{timeAgo(car.posted_at)}</span>
              </div>
              {car.vin && <p className="text-[10px] text-muted-foreground text-center">VIN: {car.vin}</p>}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
