/**
 * Normalizes raw API car data into a consistent shape for UI components.
 * Ported from the V1 normalizeCar utility with simplified TypeScript types.
 */

import { buildPublicUrl } from "./api";

const isBad = (v: any): boolean =>
  v === null || v === undefined || v === "" || v === "null" || v === "None";

const sanitizeNumber = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const num = Number(String(v).replace(/[,$]/g, ""));
  return Number.isNaN(num) ? null : num;
};

const stripZip = (s: any): string =>
  typeof s === "string" ? s.replace(/\s*\d{5}(?:-\d{4})?$/, "").trim() : "";

const STATE_ABBRS: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

function normalizeState(value: any): string | null {
  if (isBad(value)) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const lower = trimmed.toLowerCase();
    for (const [, abbr] of Object.entries(STATE_ABBRS)) {
      if (abbr.toLowerCase() === lower) return abbr;
    }
    return trimmed.toUpperCase();
  }
  const slug = trimmed.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  return STATE_ABBRS[slug] ?? trimmed;
}

function abbreviateStateInLocation(loc: string): string {
  // Replace full state names with abbreviations (e.g. "Houston, Texas" → "Houston, TX")
  for (const [full, abbr] of Object.entries(STATE_ABBRS)) {
    const re = new RegExp(`\\b${full}\\b`, "i");
    if (re.test(loc)) {
      return loc.replace(re, abbr).trim();
    }
  }
  return loc;
}

function normalizeLocation(raw: any): string {
  const candidates = [
    raw.location, raw.location_text, raw.location_string,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      const cleaned = stripZip(c) || c.trim();
      return abbreviateStateInLocation(cleaned);
    }
  }
  const city = isBad(raw.city) ? null : String(raw.city).trim();
  const state = normalizeState(raw.state);
  return [city, state].filter(Boolean).join(", ");
}

function detectTransmissionTag(value: any): string | null {
  if (isBad(value)) return null;
  const text = String(value).toLowerCase().trim();
  if (!text) return null;
  const manualHints = ["manual", "stick", "m/t"];
  const autoHints = ["automatic", "auto", "a/t", "cvt", "dual clutch", "dct", "dsg", "tiptronic", "steptronic", "pdk"];
  const isManual = manualHints.some(h => text.includes(h));
  const isAuto = autoHints.some(h => text.includes(h));
  if (isManual && !isAuto) return "Manual";
  if (isAuto && !isManual) return "Automatic";
  if (isManual && isAuto) {
    const mIdx = Math.min(...manualHints.map(h => { const i = text.indexOf(h); return i >= 0 ? i : Infinity; }));
    const aIdx = Math.min(...autoHints.map(h => { const i = text.indexOf(h); return i >= 0 ? i : Infinity; }));
    return mIdx <= aIdx ? "Manual" : "Automatic";
  }
  return null;
}

const toAbsolute = (u: string): string => {
  if (!u) return u;
  if (u.startsWith("http") || u.startsWith("data:")) return u;
  return buildPublicUrl(u);
};

export interface NormalizedCar {
  id: string;
  title: string;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  price: number | null;
  currency: string;
  mileage: number | null;
  transmission: string;
  transmissionTag: string | null;
  exteriorColor: string;
  engine: string;
  vin: string;
  source: string;
  url: string;
  imageUrl: string;
  images: string[];
  auctionStatus: string;
  endTime: string | null;
  timeLeft: string | null;
  currentBid: number | null;
  bidCount: number;
  commentCount: number;
  location: string;
  dealershipName: string | null;
  dealership: any;
  description: string;
  postedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  likes: number;
  liked: boolean;
  estimatedValue: string | null;
  estimatedValueNumber: number | null;
  highlights: any;
  equipment: any;
  modifications: any;
  knownFlaws: any;
  serviceHistory: any;
  sellerNotes: any;
  makeLogoUrl: string | null;
  distanceMiles: number | null;
  numberOfViews: number | null;
  numberOfBids: number | null;
  lotNumber: string | null;
  sellerName: string | null;
  [key: string]: any;
}

function getStableCarId(raw: any): string {
  // Accept numeric IDs (common from API)
  const numericId = raw?.id ?? raw?._id;
  if (typeof numericId === "number" && Number.isFinite(numericId)) return String(numericId);

  const directId = [raw?.id, raw?._id, raw?.vin, raw?.url, raw?.source_url, raw?.listing_url, raw?.external_id, raw?.slug, raw?.lot_number]
    .find((value) => typeof value === "string" && value.trim());

  if (directId) return String(directId).trim();

  const compositeId = [
    raw?.year ?? raw?.model_year,
    typeof raw?.make === "string" ? raw.make : raw?.make?.name,
    raw?.model ?? raw?.series,
    raw?.trim,
    raw?.title,
    raw?.price ?? raw?.current_bid ?? raw?.buy_now_price,
    raw?.location ?? raw?.city,
  ]
    .filter((value) => !isBad(value))
    .map((value) => String(value).trim())
    .join("|");

  return compositeId || "unknown-car";
}

export function normalizeCar(raw: any): NormalizedCar {
  const id = getStableCarId(raw);
  const year = raw.year ?? raw.model_year ?? null;
  const makeName = (typeof raw.make === "string" ? raw.make : raw.make?.name) ?? raw.brand ?? "";
  const model = raw.model ?? raw.series ?? "";
  const trim = isBad(raw.trim) ? null : raw.trim;
  const transmission = raw.transmission ?? raw.transmission_type ?? "";
  const transmissionTag = detectTransmissionTag(transmission);
  const title = raw.title || [year, makeName, model, trim].filter(Boolean).join(" ") || "Car";

  const price = sanitizeNumber(raw.price ?? raw.current_bid ?? raw.buy_now_price);
  const mileage = sanitizeNumber(raw.mileage ?? raw.odometer);
  const currency = raw.currency ?? "USD";

  // Images
  const imageValues: string[] = [];
  const pushImg = (v: any) => {
    if (Array.isArray(v)) { v.forEach(pushImg); return; }
    if (typeof v === "string" && v.trim()) imageValues.push(v.trim());
    if (v && typeof v === "object" && typeof v.url === "string") imageValues.push(v.url.trim());
  };
  pushImg(raw.main_image);
  pushImg(raw.image_url);
  pushImg(raw.image);
  pushImg(raw.thumbnail);
  pushImg(raw.images);
  if (raw.images_json) {
    try { pushImg(JSON.parse(raw.images_json)); } catch { /* ignore */ }
  }
  const seen = new Set<string>();
  const images = imageValues.map(toAbsolute).filter(u => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });
  const imageUrl = images[0] || "";

  // Status
  const statusRaw = String(raw.auction_status ?? raw.status ?? "").trim().toUpperCase();
  let auctionStatus: string;
  if (statusRaw === "REMOVED") {
    auctionStatus = "REMOVED";
  } else if (statusRaw === "SOLD") {
    auctionStatus = "SOLD";
  } else if (statusRaw === "AUCTION_IN_PROGRESS") {
    auctionStatus = "AUCTION_IN_PROGRESS";
  } else {
    // Check end_time / time_left
    const endTime = raw.end_time ?? raw.endTime;
    const timeLeft = raw.time_left ?? raw.timeLeft;
    if (endTime || timeLeft) {
      const endTs = endTime ? new Date(endTime).getTime() : NaN;
      const ended = !isNaN(endTs) && endTs <= Date.now();
      auctionStatus = ended ? "SOLD" : "AUCTION_IN_PROGRESS";
    } else {
      auctionStatus = "LIVE";
    }
  }

  const location = normalizeLocation(raw);
  const source = String(raw.source ?? raw.market ?? "").toLowerCase().trim();

  // Dealership
  const dealership = raw.dealership ?? null;
  const dealershipName = raw.dealership_name ?? dealership?.name ?? dealership?.display_name ?? null;

  // Make logo
  const makeRel = raw.make_rel ?? raw.make_info ?? (typeof raw.make === "object" ? raw.make : null);
  const makeLogoRaw = makeRel?.logo_url ?? null;
  const makeLogoUrl = makeLogoRaw ? toAbsolute(makeLogoRaw) : null;

  // Likes
  const likes = Math.max(0, Math.round(Number(raw.like_count ?? raw.likes ?? raw.total_likes ?? 0)) || 0);
  const liked = Boolean(raw.liked ?? raw.has_liked ?? raw.user_liked ?? false);

  // Estimated value
  const evRaw = raw.freakstats_estimated_value ?? raw.estimated_sale_price ?? null;
  const evNum = sanitizeNumber(raw.freakstats_estimated_value_number ?? raw.estimated_sale_price_value);

  // Distance
  const distKm = sanitizeNumber(raw.distance_km ?? raw.distanceKm);
  let distMiles = sanitizeNumber(raw.distance_miles ?? raw.distance ?? raw.distanceMiles);
  if (distMiles == null && distKm != null) distMiles = distKm * 0.621371;

  return {
    ...raw,
    id,
    title,
    year,
    make: makeName,
    model,
    trim,
    price,
    currency,
    mileage,
    transmission: typeof transmission === "string" ? transmission : String(transmission ?? ""),
    transmissionTag,
    exteriorColor: raw.exterior_color ?? raw.color ?? "",
    engine: raw.engine ?? "",
    vin: raw.vin ?? "",
    source,
    url: raw.url ?? raw.source_url ?? "",
    imageUrl,
    images,
    auctionStatus,
    endTime: raw.end_time ?? raw.endTime ?? null,
    timeLeft: raw.time_left ?? raw.timeLeft ?? null,
    currentBid: sanitizeNumber(raw.current_bid),
    bidCount: Number(raw.bid_count ?? raw.number_of_bids ?? 0) || 0,
    commentCount: Number(raw.comment_count ?? 0) || 0,
    location,
    dealershipName,
    dealership,
    description: raw.description ?? "",
    postedAt: raw.posted_at ?? raw.posted ?? null,
    createdAt: raw.created_at ?? null,
    updatedAt: raw.updated_at ?? null,
    likes,
    liked,
    estimatedValue: typeof evRaw === "string" ? evRaw.trim() || null : null,
    estimatedValueNumber: evNum,
    highlights: raw.highlights ?? null,
    equipment: raw.equipment ?? null,
    modifications: raw.modifications ?? null,
    knownFlaws: raw.known_flaws ?? null,
    serviceHistory: raw.service_history ?? null,
    sellerNotes: raw.seller_notes ?? raw.other_items ?? null,
    makeLogoUrl,
    distanceMiles: distMiles,
    numberOfViews: sanitizeNumber(raw.number_of_views ?? raw.views),
    numberOfBids: sanitizeNumber(raw.number_of_bids ?? raw.bids),
    lotNumber: raw.lot_number ?? raw.lotNumber ?? null,
    sellerName: raw.seller_name ?? raw.sellerName ?? null,
  };
}

export function formatPrice(price: number | null, currency = "USD"): string {
  if (price == null) return "Contact";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(price);
}

export function formatMileage(mileage: number | null): string {
  if (mileage == null) return "—";
  if (mileage >= 1000) return `${Math.round(mileage / 1000)}k mi`;
  return `${Math.round(mileage)} mi`;
}

export function formatCountdown(endTime: string | null): string {
  if (!endTime) return "";
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `Ends in ${days}d ${hours}h`;
  return `Ends in ${hours}h ${mins}m`;
}

export function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const sourceLabels: Record<string, string> = {
  bring_a_trailer: "Bring A Trailer",
  bringatrailer: "Bring A Trailer",
  cars_and_bids: "Cars & Bids",
  carsandbids: "Cars & Bids",
  autotrader: "AutoTrader",
  pca: "PCA Mart",
  pca_mart: "PCA Mart",
  facebook_marketplace: "FB Marketplace",
  dupont_registry: "duPont Registry",
};

export function getSourceLabel(source: string): string {
  return sourceLabels[source] || source.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
