import { API_BASE } from "../api.js";
import { parseEndTime, parseTimeLeft } from "./time.js";

const BAD_PUBLIC_SOURCE = new Set(["json_import"]);
const isBad = (v) => v === null || v === undefined || v === "" || v === "null" || v === "None";
const FACEBOOK_CDN_HOST_RE = /(?:^|\.)fbcdn\.net$/i;
const FACEBOOK_STP_DIMENSION_RE = /(?:^|[_-])[sp](\d{2,4})x(\d{2,4})(?:[_-]|$)/gi;
const FACEBOOK_ITEM_PATH_RE = /\/marketplace\/item\/([a-z0-9_-]+)/i;
const FACEBOOK_AVATAR_SIZE_HINT_RE = /(?:^|[_-])s(?:32|36|40|48|50|60)x(?:32|36|40|48|50|60)(?:[_-]|$)/i;
const hasCountdownValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return false;
    const lowered = trimmed.toLowerCase();
    if (["null", "none", "n/a", "na", "undefined"].includes(lowered)) return false;
  }
  return true;
};

const coerceLikeCount = (value) => {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.round(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed);
  }
  return 0;
};

const coerceLikedFlag = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return false;
    return ["true", "yes", "1", "liked"].includes(trimmed);
  }
  return false;
};

const isFacebookMarketplaceSource = (source) =>
  source === "facebook_marketplace" || source.includes("facebook");

const canonicalizeFacebookMarketplaceUrl = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const host = (parsed.hostname || "").toLowerCase();
    if (!host.includes("facebook.com")) return trimmed;
    const match = parsed.pathname.match(FACEBOOK_ITEM_PATH_RE);
    const listingId = match?.[1]?.trim();
    if (!listingId) return trimmed;
    return `https://www.facebook.com/marketplace/item/${listingId}/`;
  } catch {
    return trimmed;
  }
};

const isFacebookAvatarAssetUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    const host = (parsed.hostname || "").toLowerCase();
    if (!host.includes("facebook.com") && !FACEBOOK_CDN_HOST_RE.test(host)) return false;
    const path = (parsed.pathname || "").toLowerCase();
    const stp = (parsed.searchParams.get("stp") || "").toLowerCase();
    const sizeHaystack = `${path} ${stp}`.trim();
    if (sizeHaystack && FACEBOOK_AVATAR_SIZE_HINT_RE.test(sizeHaystack)) return true;
    if (/(?:^|[/_-])(?:avatar|profile|profilepic|profile_photo)(?:$|[/_-])/.test(path)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

const isFacebookNonListingAssetUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    const host = (parsed.hostname || "").toLowerCase();
    const path = (parsed.pathname || "").toLowerCase();
    if (!host.includes("facebook.com") && !FACEBOOK_CDN_HOST_RE.test(host)) return false;
    if (host.includes("static.xx.fbcdn.net")) return true;
    if (path.includes("/rsrc.php/") || path.endsWith("/rsrc.php")) return true;
    if (path.endsWith(".ico")) return true;
    if (path.includes("/images/logos/")) return true;
    return false;
  } catch {
    return false;
  }
};

const facebookImageAreaScore = (value) => {
  if (typeof value !== "string" || !value) return 0;
  let score = 0;
  const recordArea = (text) => {
    if (typeof text !== "string" || !text) return;
    FACEBOOK_STP_DIMENSION_RE.lastIndex = 0;
    let match;
    while ((match = FACEBOOK_STP_DIMENSION_RE.exec(text)) !== null) {
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (!Number.isFinite(width) || !Number.isFinite(height)) continue;
      if (width <= 0 || height <= 0) continue;
      score = Math.max(score, width * height);
    }
  };
  try {
    const parsed = new URL(value);
    recordArea(parsed.pathname);
    recordArea(parsed.searchParams.get("stp") || "");
  } catch {
    recordArea(value);
  }
  return score;
};

const orderFacebookMarketplaceImages = (images) =>
  images
    .map((url, index) => {
      let hostPenalty = 0;
      let cropPenalty = 0;
      let previewVariantPenalty = 0;
      let creativeVariantPenalty = 0;
      let avatarVariantPenalty = 0;
      try {
        const parsed = new URL(url);
        const host = (parsed.hostname || "").toLowerCase();
        const path = (parsed.pathname || "").toLowerCase();
        if (host.includes(".xx.fbcdn.net")) hostPenalty = 1;
        const stp = (parsed.searchParams.get("stp") || "").toLowerCase();
        if (/(?:^|_)c\d/.test(stp)) cropPenalty = 1;
        if (path.includes("/v/t15.")) previewVariantPenalty = 1;
        if (path.includes("/v/t45.")) creativeVariantPenalty = 1;
        if (isFacebookAvatarAssetUrl(url)) avatarVariantPenalty = 1;
      } catch {
        // Keep default penalties.
      }
      const area = facebookImageAreaScore(url);
      const smallPenalty = area > 0 && area <= 400 * 400 ? 1 : 0;
      return {
        url,
        index,
        area,
        smallPenalty,
        hostPenalty,
        cropPenalty,
        previewVariantPenalty,
        creativeVariantPenalty,
        avatarVariantPenalty,
      };
    })
    .sort((left, right) => {
      if (left.cropPenalty !== right.cropPenalty) return left.cropPenalty - right.cropPenalty;
      if (left.smallPenalty !== right.smallPenalty) return left.smallPenalty - right.smallPenalty;
      if (left.hostPenalty !== right.hostPenalty) return left.hostPenalty - right.hostPenalty;
      if (left.previewVariantPenalty !== right.previewVariantPenalty) {
        return left.previewVariantPenalty - right.previewVariantPenalty;
      }
      if (left.creativeVariantPenalty !== right.creativeVariantPenalty) {
        return left.creativeVariantPenalty - right.creativeVariantPenalty;
      }
      if (left.avatarVariantPenalty !== right.avatarVariantPenalty) {
        return left.avatarVariantPenalty - right.avatarVariantPenalty;
      }
      const leftHasArea = left.area > 0;
      const rightHasArea = right.area > 0;
      if (leftHasArea && rightHasArea && right.area !== left.area) {
        return right.area - left.area;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.url);
const stripZip = (s) =>
  typeof s === "string" ? s.replace(/\s*\d{5}(?:-\d{4})?$/, "").trim() : s;
const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STATE_NAME_TO_ABBR = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

const STATE_SLUG_TO_ABBR = Object.entries(STATE_NAME_TO_ABBR).reduce(
  (acc, [name, abbr]) => {
    const slug = slugify(name);
    if (slug) acc[slug] = abbr;
    const compressed = slug.replace(/\s+/g, "");
    if (compressed) acc[compressed] = abbr;
    acc[abbr.toLowerCase()] = abbr;
    return acc;
  },
  { dc: "DC", "washington dc": "DC", districtofcolumbia: "DC" }
);

const normalizeState = (value) => {
  if (isBad(value)) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const match = STATE_SLUG_TO_ABBR[trimmed.toLowerCase()];
    return match ?? trimmed.toUpperCase();
  }
  const slug = slugify(trimmed);
  if (!slug) return trimmed;
  const abbr =
    STATE_SLUG_TO_ABBR[slug] ??
    STATE_SLUG_TO_ABBR[slug.replace(/\s+/g, "")];
  return abbr ?? trimmed;
};

const normalizeLocationText = (value) => {
  if (isBad(value)) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part);
  if (parts.length === 0) return null;

  let stateIndex = -1;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const abbr = normalizeState(parts[i]);
    if (abbr && abbr.length === 2) {
      parts[i] = abbr;
      stateIndex = i;
      break;
    }
  }

  if (stateIndex > 0) {
    const priorParts = parts.slice(0, stateIndex);
    let cityPart = null;
    for (let i = priorParts.length - 1; i >= 0; i -= 1) {
      const candidate = priorParts[i];
      if (!/[0-9]/.test(candidate)) {
        cityPart = candidate;
        break;
      }
    }
    if (!cityPart && priorParts.length > 0) {
      cityPart = priorParts[priorParts.length - 1];
    }
    if (cityPart) {
      return `${cityPart}, ${parts[stateIndex]}`;
    }
    return parts[stateIndex];
  }

  return parts.join(", ");
};

const extractCityState = (value) => {
  if (isBad(value)) return { city: null, state: null };
  const normalized = normalizeLocationText(value);
  if (!normalized) return { city: null, state: null };
  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const statePart = normalizeState(parts[parts.length - 1]);
    const cityPart = parts.slice(0, parts.length - 1).join(", ").trim();
    return {
      city: cityPart || null,
      state: statePart || null,
    };
  }
  if (parts.length === 1) {
    const statePart = normalizeState(parts[0]);
    if (statePart && statePart.length === 2) {
      return { city: null, state: statePart };
    }
  }
  return { city: null, state: null };
};

const parseCoordinate = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (lower === "null" || lower === "none") return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
};

const toAbsolute = (u) => {
  if (typeof u !== "string") return u;
  if (u.startsWith("http") || u.startsWith("data:")) return u;
  return `${API_BASE}${u.startsWith("/") ? u : "/" + u}`;
};

const normalizeTimestamp = (value) => {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (lower === "null" || lower === "none") return null;
    return trimmed;
  }
  return null;
};

const detectTransmissionType = (value) => {
  if (isBad(value)) return null;
  const rawText = typeof value === "string" ? value : String(value ?? "");
  const text = rawText.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const normalized = lower.replace(/[^a-z0-9]+/g, " ");
  const tokens = normalized.split(" ").filter(Boolean);
  const tokenSet = new Set(tokens);

  const hasManualIndicator =
    lower.includes("manual") ||
    lower.includes("stick") ||
    lower.includes("m/t") ||
    tokenSet.has("mt") ||
    Array.from(tokenSet).some((token) => /^\d+mt$/.test(token));

  const hasAutomaticIndicator =
    lower.includes("automatic") ||
    lower.includes("auto") ||
    lower.includes("a/t") ||
    lower.includes("cvt") ||
    lower.includes("dual clutch") ||
    lower.includes("dual-clutch") ||
    lower.includes("dct") ||
    lower.includes("dsg") ||
    lower.includes("tiptronic") ||
    lower.includes("steptronic") ||
    lower.includes("pdk") ||
    lower.includes("amt") ||
    tokenSet.has("at") ||
    Array.from(tokenSet).some((token) => /^\d+at$/.test(token));

  if (!hasManualIndicator && !hasAutomaticIndicator) {
    return null;
  }

  if (hasManualIndicator && !hasAutomaticIndicator) return "Manual";
  if (hasAutomaticIndicator && !hasManualIndicator) return "Automatic";

  const manualIndex = lower.search(/manual|stick|m\/t|\bmt\b|\dmt/);
  const autoIndex = lower.search(/automatic|auto|a\/t|cvt|dual[-\s]?clutch|dct|dsg|tiptronic|steptronic|pdk|amt/);
  if (manualIndex === -1 && autoIndex !== -1) return "Automatic";
  if (autoIndex === -1 && manualIndex !== -1) return "Manual";
  if (manualIndex !== -1 && autoIndex !== -1) {
    return manualIndex <= autoIndex ? "Manual" : "Automatic";
  }
  return null;
};

export function normalizeCar(raw, options = {}) {
  const { makeLookup } = options ?? {};
  const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : null);
  const lookupMake =
    raw.make_id != null && makeLookup && typeof makeLookup === "object"
      ? makeLookup[raw.make_id]
      : null;
  const makeCandidate =
    asObject(raw.make_rel) ||
    asObject(raw.make_info) ||
    asObject(raw.make_obj) ||
    asObject(raw.make) ||
    asObject(lookupMake) ||
    null;
  const makeId = raw.make_id ?? (makeCandidate && makeCandidate.id != null ? makeCandidate.id : null);
  const makeName =
    (makeCandidate && typeof makeCandidate.name === "string" ? makeCandidate.name : null) ??
    (typeof raw.make === "string" ? raw.make : null) ??
    raw.brand ??
    raw.manufacturer ??
    null;
  const makeLogoRaw =
    (makeCandidate && makeCandidate.logo_url != null ? makeCandidate.logo_url : null) ??
    (lookupMake && lookupMake.logo_url != null ? lookupMake.logo_url : null) ??
    null;
  const make_rel =
    makeId != null || makeName || makeLogoRaw
      ? { id: makeId ?? null, name: makeName ?? null, logo_url: makeLogoRaw ?? null }
      : null;
  const makeLogoCandidate = make_rel?.logo_url ?? null;
  const id = raw.id ?? raw._id ?? raw.vin ?? raw.lot_number ?? raw.url ?? Math.random().toString(36).slice(2);
  const vin = raw.vin ?? raw.vin_number ?? raw.vin_no ?? raw.vinCode ?? raw.chassis ?? null;
  const year = raw.year ?? raw.model_year ?? null;
  const make = makeName;
  const model = raw.model ?? raw.series ?? null;
  const trim = isBad(raw.trim) ? null : raw.trim;
  const transmissionSource =
    raw.transmission ??
    raw.transmission_type ??
    raw.transmissionType ??
    raw.trans ??
    null;
  let transmission = null;
  if (!isBad(transmissionSource)) {
    if (typeof transmissionSource === "string") {
      transmission = transmissionSource.trim();
    } else if (
      transmissionSource &&
      typeof transmissionSource === "object" &&
      typeof transmissionSource.name === "string"
    ) {
      transmission = transmissionSource.name.trim();
    } else if (transmissionSource != null) {
      transmission = String(transmissionSource).trim();
    }
    if (isBad(transmission)) transmission = null;
  }
  const transmissionTag = detectTransmissionType(transmission);
  const title = raw.title || [year, make, model, trim].filter(Boolean).join(" ") || "Car";

  // core numeric fields
  const sanitizeNumber = (v) => {
    if (v === null || v === undefined) return null;
    const num = Number(String(v).replace(/[,$]/g, ""));
    return Number.isNaN(num) ? null : num;
  };
  const price = sanitizeNumber(
    raw.price ?? raw.current_bid ?? raw.buy_now_price ?? raw.offer?.price
  );
  const mileage = sanitizeNumber(
    raw.mileage ?? raw.odometer ?? raw.offer?.mileage
  );

  // simple text fields
  const category = raw.category ?? null;
  const dealership = raw.dealership ?? raw.dealership_name ?? null;
  const currency = raw.currency ?? raw.price_currency ?? raw.offer?.currency ?? null;
  const rawCity = isBad(raw.city) ? null : String(raw.city).trim();
  const rawState = normalizeState(raw.state);

  const locationAddressRaw = raw.location_address ?? raw.address ?? raw.location?.address ?? null;
  const locationAddressStr = stripZip(locationAddressRaw);
  const normalizedLocationAddress = normalizeLocationText(locationAddressStr);

  const locationCandidates = [
    raw.location,
    raw.location_text,
    raw.locationText,
    raw.location_string,
    raw.locationString,
    raw.dealership?.location,
    raw.dealership_location,
    raw.dealershipLocation,
  ];

  let locationRaw = null;
  for (const candidate of locationCandidates) {
    const normalized = normalizeLocationText(stripZip(candidate));
    if (normalized) {
      locationRaw = normalized;
      break;
    }
  }
  const inferredCityState = extractCityState(locationRaw ?? normalizedLocationAddress);
  const city = rawCity ?? inferredCityState.city;
  const state = rawState ?? inferredCityState.state;
  const cityState = [city, state].filter((part) => !isBad(part)).join(", ") || null;
  const location = !isBad(locationRaw)
    ? locationRaw
    : normalizedLocationAddress ?? cityState;

  const latitude = parseCoordinate(
    raw.latitude ?? raw.lat ?? raw.location?.latitude ?? raw.location?.lat ?? null,
  );
  const longitude = parseCoordinate(
    raw.longitude ??
      raw.lng ??
      raw.lon ??
      raw.location?.longitude ??
      raw.location?.lng ??
      raw.location?.lon ??
      null,
  );
  const raw_distance_km = parseCoordinate(
    raw.distance_km ?? raw.distanceKm ?? raw.distance_kilometers ?? null,
  );
  let distance_miles = parseCoordinate(
    raw.distance_miles ?? raw.distance ?? raw.distanceMiles ?? raw.distance_mi ?? null,
  );
  if (distance_miles == null && raw_distance_km != null) {
    distance_miles = raw_distance_km * 0.621371;
  }
  const distance_km =
    raw_distance_km != null
      ? raw_distance_km
      : distance_miles != null
        ? distance_miles * 1.609344
        : null;

  const sourceRaw = (raw.source ?? raw.market ?? "").toLowerCase().trim();
  const isFacebookSource = isFacebookMarketplaceSource(sourceRaw);
  const sourceHidden = BAD_PUBLIC_SOURCE.has(sourceRaw);
  const source = sourceHidden ? "" : sourceRaw;
  const rawUrl = raw.url ?? raw.source_url ?? null;
  const url = isFacebookSource ? canonicalizeFacebookMarketplaceUrl(rawUrl) : rawUrl;

  const lot_number = raw.lot_number ?? raw.lotNumber ?? null;
  const posted_at = normalizeTimestamp(raw.posted_at ?? raw.postedAt ?? null);
  const created_at = normalizeTimestamp(raw.created_at ?? raw.createdAt ?? null);
  const updated_at = normalizeTimestamp(raw.updated_at ?? raw.updatedAt ?? null);
  const seller_name = raw.seller_name ?? raw.sellerName ?? raw.seller?.name ?? null;
  const seller_rating = raw.seller_rating ?? raw.sellerRating ?? raw.seller?.rating ?? null;
  const seller_reviews = raw.seller_reviews ?? raw.sellerReviews ?? raw.seller?.reviews ?? null;
  const location_url = raw.location_url ?? raw.locationUrl ?? raw.location?.url ?? null;
  const end_time = raw.end_time ?? raw.endTime ?? null;
  const time_left = raw.time_left ?? raw.timeLeft ?? null;
  const number_of_views = raw.number_of_views ?? raw.views ?? null;
  const number_of_bids = raw.number_of_bids ?? raw.bids ?? null;

  const imageValues = [];
  const pushImage = (value) => {
    if (!value && value !== 0) return;
    if (Array.isArray(value)) {
      value.forEach(pushImage);
      return;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && !isBad(trimmed)) imageValues.push(trimmed);
      return;
    }
    if (value && typeof value === "object") {
      if (typeof value.url === "string") pushImage(value.url);
    }
  };

  pushImage(raw.main_image);
  pushImage(raw.image_url);
  pushImage(raw.image);
  pushImage(raw.thumbnail);
  pushImage(raw.photo_url);
  pushImage(raw.images);

  if (raw.images_json) {
    try {
      const extra = JSON.parse(raw.images_json);
      pushImage(extra);
    } catch {
      const parts = String(raw.images_json)
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
      pushImage(parts);
    }
  }

  let images = imageValues
    .map(toAbsolute)
    .map((url) => (typeof url === "string" ? url.trim() : null))
    .filter((url) => typeof url === "string" && url);

  const seenImages = new Set();
  images = images.filter((url) => {
    if (seenImages.has(url)) return false;
    seenImages.add(url);
    return true;
  });
  if (isFacebookSource) {
    images = images.filter(
      (url) =>
        !isFacebookAvatarAssetUrl(url) &&
        !isFacebookNonListingAssetUrl(url)
    );
  }
  if (isFacebookSource && images.length > 1) {
    images = orderFacebookMarketplaceImages(images);
  }
  const image_url = images[0] || null;
  const make_logo_url = makeLogoCandidate ? toAbsolute(makeLogoCandidate) : null;
  const normalizedMake = make_rel ? { ...make_rel, logo_url: make_logo_url } : null;
  const normalizedMakeId = normalizedMake?.id ?? (raw.make_id ?? null);

  const statusCandidate = raw.auction_status ?? raw.status ?? "";
  const statusText = typeof statusCandidate === "string" ? statusCandidate.trim() : String(statusCandidate || "");
  const statusUpperHint = statusText.toUpperCase();

  const endRaw = raw.end_time ?? raw.endTime ?? null;
  const timeLeftRaw = raw.time_left ?? raw.timeLeft ?? null;
  const endTs = parseEndTime(endRaw, { rollForward: false });
  const timeLeftMs = parseTimeLeft(timeLeftRaw);
  const hasEndField = hasCountdownValue(endRaw);
  const hasTimeLeftField = hasCountdownValue(timeLeftRaw);
  const countdownPresent =
    !Number.isNaN(endTs) || !Number.isNaN(timeLeftMs) || hasEndField || hasTimeLeftField;

  const endedByEndTime = !Number.isNaN(endTs) && endTs <= Date.now();
  const endedByTimeLeft = !Number.isNaN(timeLeftMs) && timeLeftMs <= 0;
  const ended = endedByEndTime || endedByTimeLeft;

  let auction_status;
  if (statusUpperHint === "REMOVED") {
    auction_status = "REMOVED";
  } else if (countdownPresent) {
    auction_status = ended ? "SOLD" : "AUCTION_IN_PROGRESS";
  } else {
    auction_status = "LIVE";
  }

  const status = auction_status.toUpperCase();

  const like_count = coerceLikeCount(
    raw.like_count ?? raw.likes ?? raw.likeCount ?? raw.total_likes
  );
  const liked = coerceLikedFlag(raw.liked ?? raw.has_liked ?? raw.user_liked);
  const freakstats_estimated_value =
    raw.freakstats_estimated_value ?? raw.estimated_sale_price ?? null;
  const freakstats_estimated_value_number_raw =
    raw.freakstats_estimated_value_number ?? raw.estimated_sale_price_value ?? null;
  const freakstats_estimated_value_number = Number.isFinite(
    Number(freakstats_estimated_value_number_raw)
  )
    ? Number(freakstats_estimated_value_number_raw)
    : null;


  return {
    ...raw,
    auction_status,

    make_id: normalizedMakeId,
    make_rel: normalizedMake,
    make_logo_url,

    category,
    dealership,
    currency,
    city,
    state,

    // Ensure core identity fields are always present
    id,
    vin,
    year,
    make,
    model,
    trim,
    transmission,

    price,
    mileage,

    lot_number,
    posted_at,
    created_at,
    updated_at,
    seller_name,
    seller_rating,
    seller_reviews,
    url,

    location_address: normalizedLocationAddress,
    location_url,
    latitude,
    longitude,
    distance_miles,
    distance_km,
    end_time,
    time_left,
    number_of_views,
    number_of_bids,

    __id: String(id),
    __title: title,
    __year: year,
    __make: make,
    __makeLogo: make_logo_url,
    __model: model,
    __trim: trim,
    __transmission: transmissionTag,
    __price: price,
    __mileage: mileage,
    __location: location,
    __latitude: latitude,
    __longitude: longitude,
    __distance: distance_miles,
    __distanceKm: distance_km,
    __source: source,           // never "json_import" in public UI
    __sourceHidden: sourceHidden,
    image_url,
    __images: images,
    __image: image_url,
    __status: status,
    like_count,
    liked,
    __likeCount: like_count,
    __liked: liked,
    freakstats_estimated_value,
    freakstats_estimated_value_number,
    __freakstatsEstimatedValue:
      typeof freakstats_estimated_value === "string"
        ? freakstats_estimated_value.trim() || null
        : null,
    __freakstatsEstimatedValueNumber: freakstats_estimated_value_number,
  };
}

export { normalizeState, extractCityState, normalizeLocationText };
