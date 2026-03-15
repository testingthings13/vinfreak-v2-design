export interface Car {
  id: string;
  title: string;
  make: string;
  model: string;
  year: number;
  price: number | null;
  currency: string;
  mileage: number | null;
  transmission: string;
  exterior_color: string;
  engine: string;
  vin: string;
  source: string;
  url: string;
  image_url: string;
  images: string[];
  auction_status: "LIVE" | "AUCTION_IN_PROGRESS" | "SOLD" | "REMOVED";
  auction_end_time: string | null;
  current_bid: number | null;
  bid_count: number;
  comment_count: number;
  location: string;
  dealership_name: string | null;
  description: string;
  specs: Record<string, string>;
  posted_at: string;
  likes: number;
  price_label: string;
}

export const mockCars: Car[] = [
  {
    id: "1",
    title: "2013 Rolls-Royce Cullinan Black Badge",
    make: "Rolls-Royce", model: "Cullinan", year: 2013, price: 647000, currency: "USD",
    mileage: 22000, transmission: "Manual", exterior_color: "Black", engine: "6.75L V12",
    vin: "SCA665C50DUX12345", source: "bring_a_trailer", url: "#",
    image_url: "https://images.unsplash.com/photo-1621135802920-133df287f89c?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1621135802920-133df287f89c?w=800&q=80"],
    auction_status: "LIVE", auction_end_time: null, current_bid: null, bid_count: 0,
    comment_count: 5, location: "Napa Valley, CA", dealership_name: null,
    description: "Stunning Rolls-Royce Cullinan Black Badge with full options.",
    specs: { "Drivetrain": "AWD", "Horsepower": "591 hp" },
    posted_at: new Date(Date.now() - 86400000 * 8).toISOString(), likes: 11, price_label: "Buy Now",
  },
  {
    id: "2",
    title: "No Reserve: 2021 Lamborghini Gallardo Superleggera",
    make: "Lamborghini", model: "Gallardo", year: 2021, price: null, currency: "USD",
    mileage: 15000, transmission: "Automatic", exterior_color: "Blue", engine: "5.2L V10",
    vin: "ZHWGU22T59LA12345", source: "cars_and_bids", url: "#",
    image_url: "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=800&q=80"],
    auction_status: "AUCTION_IN_PROGRESS",
    auction_end_time: new Date(Date.now() + 86400000 * 2 + 3600000).toISOString(),
    current_bid: 573500, bid_count: 47, comment_count: 5, location: "Denver, CO",
    dealership_name: null, description: "No Reserve Gallardo Superleggera with low miles.",
    specs: { "Drivetrain": "AWD", "Horsepower": "523 hp" },
    posted_at: new Date(Date.now() - 86400000).toISOString(), likes: 20, price_label: "Current Bid",
  },
  {
    id: "3",
    title: "1982 Toyota Land Cruiser FJ40",
    make: "Toyota", model: "Land Cruiser", year: 1982, price: 88000, currency: "USD",
    mileage: 82000, transmission: "Manual", exterior_color: "Beige", engine: "4.2L I6",
    vin: "FJ40-123456", source: "dupont_registry", url: "#",
    image_url: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80"],
    auction_status: "LIVE", auction_end_time: null, current_bid: null, bid_count: 0,
    comment_count: 5, location: "Beverly Hills, CA", dealership_name: null,
    description: "Classic FJ40 in excellent condition.",
    specs: { "Drivetrain": "4WD", "Horsepower": "135 hp" },
    posted_at: new Date(Date.now() - 86400000 * 5).toISOString(), likes: 21, price_label: "Buy Now",
  },
  {
    id: "4",
    title: "No Reserve: 1985 Porsche 918 Spyder",
    make: "Porsche", model: "918 Spyder", year: 1985, price: null, currency: "USD",
    mileage: 31000, transmission: "Manual", exterior_color: "Silver", engine: "4.6L V8 Hybrid",
    vin: "WP0AF2A91PS123456", source: "facebook_marketplace", url: "#",
    image_url: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&q=80"],
    auction_status: "AUCTION_IN_PROGRESS",
    auction_end_time: new Date(Date.now() + 3600000 * 18 + 60000 * 52).toISOString(),
    current_bid: 459500, bid_count: 32, comment_count: 5, location: "Greenwich, CT",
    dealership_name: null, description: "Stunning 918 Spyder, no reserve.",
    specs: { "Drivetrain": "AWD", "Horsepower": "887 hp" },
    posted_at: new Date(Date.now() - 86400000 * 9).toISOString(), likes: 13, price_label: "Current Bid",
  },
  {
    id: "5",
    title: "1999 Ferrari SF90 Stradale",
    make: "Ferrari", model: "SF90", year: 1999, price: 425000, currency: "USD",
    mileage: 8000, transmission: "Automatic", exterior_color: "Rosso Corsa", engine: "4.0L V8 Hybrid",
    vin: "ZFF92T6B000123456", source: "bring_a_trailer", url: "#",
    image_url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80"],
    auction_status: "LIVE", auction_end_time: null, current_bid: null, bid_count: 0,
    comment_count: 8, location: "Manhattan, NY", dealership_name: null,
    description: "Low-mileage SF90 in Rosso Corsa.",
    specs: { "Drivetrain": "AWD", "Horsepower": "986 hp" },
    posted_at: new Date(Date.now() - 86400000 * 3).toISOString(), likes: 35, price_label: "Buy Now",
  },
  {
    id: "6",
    title: "2004 Bugatti Centodieci",
    make: "Bugatti", model: "Centodieci", year: 2004, price: null, currency: "USD",
    mileage: 1200, transmission: "Automatic", exterior_color: "White", engine: "8.0L W16",
    vin: "VF9SA3A26FM123456", source: "cars_and_bids", url: "#",
    image_url: "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&q=80"],
    auction_status: "AUCTION_IN_PROGRESS",
    auction_end_time: new Date(Date.now() + 3600000 * 20 + 60000 * 45).toISOString(),
    current_bid: 8900000, bid_count: 89, comment_count: 12, location: "Monaco",
    dealership_name: null, description: "Incredibly rare Centodieci, 1 of 10.",
    specs: { "Drivetrain": "AWD", "Horsepower": "1,577 hp" },
    posted_at: new Date(Date.now() - 86400000 * 2).toISOString(), likes: 156, price_label: "Current Bid",
  },
  {
    id: "7",
    title: "2023 Porsche 911 GT3 RS Weissach",
    make: "Porsche", model: "911 GT3 RS", year: 2023, price: 325000, currency: "USD",
    mileage: 950, transmission: "PDK", exterior_color: "Python Green", engine: "4.0L Flat-6",
    vin: "WP0AF2A97PS789012", source: "bring_a_trailer", url: "#",
    image_url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80"],
    auction_status: "LIVE", auction_end_time: null, current_bid: null, bid_count: 0,
    comment_count: 15, location: "Scottsdale, AZ", dealership_name: "Motorsport Collection",
    description: "GT3 RS Weissach in Python Green.",
    specs: { "Drivetrain": "RWD", "Horsepower": "518 hp" },
    posted_at: new Date(Date.now() - 86400000 * 1).toISOString(), likes: 42, price_label: "Buy Now",
  },
  {
    id: "8",
    title: "1994 Toyota Supra MK4 Twin Turbo",
    make: "Toyota", model: "Supra", year: 1994, price: 145000, currency: "USD",
    mileage: 38000, transmission: "Manual", exterior_color: "Renaissance Red", engine: "2JZ-GTE",
    vin: "JT2JA82J5R0012345", source: "facebook_marketplace", url: "#",
    image_url: "https://images.unsplash.com/photo-1632245889029-e406faaa34cd?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1632245889029-e406faaa34cd?w=800&q=80"],
    auction_status: "LIVE", auction_end_time: null, current_bid: null, bid_count: 0,
    comment_count: 7, location: "Miami, FL", dealership_name: "JDM Legends",
    description: "Bone stock MK4 Supra Twin Turbo.",
    specs: { "Drivetrain": "RWD", "Horsepower": "320 hp" },
    posted_at: new Date(Date.now() - 86400000 * 4).toISOString(), likes: 67, price_label: "Buy Now",
  },
  {
    id: "9",
    title: "2024 Mercedes-AMG GT 63 S E Performance",
    make: "Mercedes-Benz", model: "AMG GT", year: 2024, price: null, currency: "USD",
    mileage: 2100, transmission: "Automatic", exterior_color: "Cashmere White", engine: "4.0L V8 Hybrid",
    vin: "WDD1903721A123456", source: "dupont_registry", url: "#",
    image_url: "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80",
    images: ["https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80"],
    auction_status: "AUCTION_IN_PROGRESS",
    auction_end_time: new Date(Date.now() + 86400000 * 3).toISOString(),
    current_bid: 198000, bid_count: 28, comment_count: 6, location: "Chicago, IL",
    dealership_name: "Luxury Auto Group", description: "AMG GT 63 S E Performance.",
    specs: { "Drivetrain": "AWD", "Horsepower": "831 hp" },
    posted_at: new Date(Date.now() - 86400000 * 6).toISOString(), likes: 33, price_label: "Current Bid",
  },
];

export const makes = [...new Set(mockCars.map(c => c.make))].sort();
export const sources = [...new Set(mockCars.map(c => c.source))].sort();

export const sourceLabels: Record<string, string> = {
  bring_a_trailer: "Bring A Trailer",
  cars_and_bids: "Cars & Bids",
  autotrader: "AutoTrader",
  pca_mart: "PCA Mart",
  facebook_marketplace: "FB Marketplace",
  dupont_registry: "duPont Registry",
};

export function formatPrice(price: number | null, currency = "USD"): string {
  if (!price) return "Contact";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(price);
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatCountdown(endTime: string): string {
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `Ends in ${days}d ${hours}h`;
  return `Ends in ${hours}h ${mins}m`;
}
