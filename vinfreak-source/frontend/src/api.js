// Unified API helper that supports both array and {items,total,...} responses.
// The frontend now talks to the production backend hosted at
// vinfreak.onrender.com.  Deployments that require a different backend can
// still override this by providing a `VITE_API_BASE` environment variable at
// build time.
const ENV = (import.meta && import.meta.env) ? import.meta.env : {};
const DEFAULT_BASE =
  typeof window !== "undefined" && window.location && window.location.origin
    ? window.location.origin
    : "https://vinfreak.onrender.com";

// Final API base URL. Use VITE_API_BASE env var if provided at build time
// (e.g. when the frontend is served from a different domain), otherwise
// fall back to the origin/production default above.
const RAW_BASE =
  typeof ENV.VITE_API_BASE === "string" && ENV.VITE_API_BASE.trim()
    ? ENV.VITE_API_BASE.trim()
    : DEFAULT_BASE;
const BASE = RAW_BASE.replace(/\/+$/, "");
const RAW_ADMIN_BASE =
  typeof ENV.VITE_ADMIN_BASE === "string" && ENV.VITE_ADMIN_BASE.trim()
    ? ENV.VITE_ADMIN_BASE.trim()
    : "https://admin.vinfreak.com";
const ADMIN_BASE = RAW_ADMIN_BASE.replace(/\/+$/, "");
const API_PREFIX = "/api";
export const API_BASE = BASE;

const nearestGeoCache = new Map();

function encodeBase64(value) {
  if (typeof btoa === "function") return btoa(value);
  if (typeof Buffer !== "undefined") return Buffer.from(value).toString("base64");
  return null;
}

function buildBasicAuth() {
  const raw = typeof ENV.VITE_BASIC_AUTH === "string" ? ENV.VITE_BASIC_AUTH.trim() : "";
  if (raw) {
    if (raw.toLowerCase().startsWith("basic ")) return raw;
    const encoded = encodeBase64(raw);
    return encoded ? `Basic ${encoded}` : null;
  }
  const user = typeof ENV.VITE_BASIC_AUTH_USERNAME === "string" ? ENV.VITE_BASIC_AUTH_USERNAME : "";
  const pass = typeof ENV.VITE_BASIC_AUTH_PASSWORD === "string" ? ENV.VITE_BASIC_AUTH_PASSWORD : "";
  if (!user && !pass) return null;
  const encoded = encodeBase64(`${user}:${pass}`);
  return encoded ? `Basic ${encoded}` : null;
}

const BASIC_AUTH = buildBasicAuth();

const nearestLocationCache = new Map();

function buildNearestCacheKey({ sort, saleType, extras }) {
  const normalizedExtras = {};
  const keys = Object.keys(extras || {}).sort();
  for (const key of keys) {
    normalizedExtras[key] = extras[key];
  }
  return JSON.stringify({ sort, saleType: saleType || "", extras: normalizedExtras });
}


// Generic JSON fetch with timeout
function resolvePath(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized.startsWith(API_PREFIX)) return normalized;
  return `${API_PREFIX}${normalized}`;
}

function buildHeaders(extra = {}) {
  const headers = { ...extra };
  if (!headers.Accept) headers.Accept = "application/json";
  if (BASIC_AUTH) headers.Authorization = BASIC_AUTH;
  return headers;
}

export async function getJSON(path, { timeoutMs = 12000 } = {}) {
  const url = `${BASE}${resolvePath(path)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: buildHeaders(),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok)
      throw new Error(`${res.status} ${res.statusText} • ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`);
    }
  } catch (e) {
    if (e.name === "AbortError")
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function postJSON(
  path,
  body,
  { timeoutMs = 15000, signal: externalSignal } = {}
) {
  const url = `${BASE}${resolvePath(path)}`;
  const ctrl = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);

  const forwardAbort = () => ctrl.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeout);
      if (externalSignal.reason instanceof Error) {
        throw externalSignal.reason;
      }
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }
    externalSignal.addEventListener("abort", forwardAbort);
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: buildHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 200);
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object") {
          detail = parsed.detail || detail;
        }
      } catch {
        // ignore JSON parse errors for error payloads
      }
      throw new Error(`POST ${url} ${res.status} ${res.statusText} • ${detail}`);
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`);
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      if (timedOut) {
        throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
      }
      throw error;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", forwardAbort);
    }
  }
}

// Fetch global site settings exposed by the backend
export function getSettings() {
  return getJSON("/public/settings");
}

export function verifySitePassword(password) {
  if (typeof password !== "string") {
    throw new Error("Password must be a string");
  }
  return postJSON("/public/site-password", { password });
}

function resolveAdminBases() {
  const candidates = [];
  const seen = new Set();
  const push = (value) => {
    if (typeof value !== "string" || !value.trim()) return;
    const normalized = value.trim().replace(/\/+$/, "");
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  push(ADMIN_BASE);

  return candidates;
}

export async function getAdminSessionStatus({ timeoutMs = 6000 } = {}) {
  const adminBases = resolveAdminBases();

  for (const baseUrl of adminBases) {
    const url = `${baseUrl}/admin/session/status`;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: buildHeaders(),
        credentials: "include",
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) continue;
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = {};
      }
      return {
        authenticated: Boolean(payload?.authenticated),
        can_delete_cars: Boolean(payload?.can_delete_cars),
        csrf_token:
          typeof payload?.csrf_token === "string" ? payload.csrf_token : "",
        admin_api_base: baseUrl,
      };
    } catch {
      // try next candidate base
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    authenticated: false,
    can_delete_cars: false,
    csrf_token: "",
    admin_api_base: ADMIN_BASE,
  };
}

export async function adminDeleteCar(carId, csrfToken, adminApiBase) {
  const id = String(carId || "").trim();
  if (!id) throw new Error("carId required");
  const token = String(csrfToken || "").trim();
  if (!token) throw new Error("Missing CSRF token");

  const baseUrl =
    typeof adminApiBase === "string" && adminApiBase.trim()
      ? adminApiBase.trim().replace(/\/+$/, "")
      : ADMIN_BASE;
  const url = `${baseUrl}/admin/cars/${encodeURIComponent(id)}/delete-json`;

  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders({
      "Content-Type": "application/json",
      "X-CSRF-Token": token,
    }),
    credentials: "include",
    body: "{}",
  });

  const text = await res.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }

  if (!res.ok) {
    const detail =
      (payload && typeof payload === "object" && payload.detail) ||
      text.slice(0, 200) ||
      `${res.status} ${res.statusText}`;
    throw new Error(String(detail));
  }

  return payload;
}

export async function adminSetCarMainImage(
  carId,
  imageUrl,
  csrfToken,
  adminApiBase
) {
  const id = String(carId || "").trim();
  if (!id) throw new Error("carId required");
  const selectedImage = String(imageUrl || "").trim();
  if (!selectedImage) throw new Error("imageUrl required");
  const token = String(csrfToken || "").trim();
  if (!token) throw new Error("Missing CSRF token");

  const baseUrl =
    typeof adminApiBase === "string" && adminApiBase.trim()
      ? adminApiBase.trim().replace(/\/+$/, "")
      : ADMIN_BASE;
  const url = `${baseUrl}/admin/cars/${encodeURIComponent(id)}/main-image-json`;

  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders({
      "Content-Type": "application/json",
      "X-CSRF-Token": token,
    }),
    credentials: "include",
    body: JSON.stringify({ image_url: selectedImage }),
  });

  const text = await res.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }

  if (!res.ok) {
    const detail =
      (payload && typeof payload === "object" && payload.detail) ||
      text.slice(0, 200) ||
      `${res.status} ${res.statusText}`;
    throw new Error(String(detail));
  }

  return payload;
}

// Fetch dealerships list
export function getDealerships() {
  return getJSON("/dealerships");
}

// Fetch makes list
export function getMakes() {
  return getJSON("/makes");
}

export function lookupIp(ip) {
  const path = ip ? `/geo/ip?ip=${encodeURIComponent(ip)}` : "/geo/ip";
  return getJSON(path);
}

export async function fetchListings({
  sort = "recent",
  saleType,
  limit = 50,
  offset = 0,
  cursor,
  params = {},
} = {}) {
  const search = new URLSearchParams();
  const normalizedSort =
    typeof sort === "string" && sort.trim() ? sort.trim() : "recent";
  search.set("sort", normalizedSort);
  if (limit != null) search.set("limit", String(limit));

  const normalizedSaleType =
    typeof saleType === "string" && saleType.trim() ? saleType.trim() : "";
  if (normalizedSaleType) search.set("type", normalizedSaleType);

  const extras = { ...(params || {}) };
  const pickCoord = (keys) => {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(extras, key)) {
        const value = extras[key];
        delete extras[key];
        if (value != null && value !== "") return value;
      }
    }
    return null;
  };

  let lat = pickCoord(["lat", "latitude"]);
  let lon = pickCoord(["lon", "lng", "longitude", "long"]);

  if (cursor?.distance != null && cursor?.id != null) {
    search.set("cursor_distance", String(cursor.distance));
    search.set("cursor_id", String(cursor.id));
  } else if (offset != null) {
    search.set("offset", String(offset));
  }

  for (const [key, value] of Object.entries(extras)) {
    if (value == null) continue;
    search.set(key, String(value));
  }

  let cacheKey = null;
  if (normalizedSort === "nearest") {
    cacheKey = buildNearestCacheKey({
      sort: normalizedSort,
      saleType: normalizedSaleType,
      extras,
    });

    if (cacheKey) {
      const cached = nearestGeoCache.get(cacheKey);
      if (cached) {
        if (lat == null && cached.lat != null) lat = cached.lat;
        if (lon == null && cached.lon != null) lon = cached.lon;
      }
    }

    if ((lat == null || lon == null) && cacheKey) {
      const cachedLocation = nearestLocationCache.get(cacheKey);
      if (cachedLocation) {
        if (lat == null && cachedLocation.lat != null) lat = cachedLocation.lat;
        if (lon == null && cachedLocation.lon != null) lon = cachedLocation.lon;
      }
    }

    if (lat == null || lon == null) {
      const position = await new Promise((resolve, reject) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          reject(new Error("Geolocation unavailable"));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        });
      });
      lat = position.coords.latitude;
      lon = position.coords.longitude;
    }

    if (cacheKey) {
      nearestLocationCache.set(cacheKey, { lat, lon });
      nearestGeoCache.set(cacheKey, {
        lat: lat != null ? Number(lat) : lat,
        lon: lon != null ? Number(lon) : lon,
      });
    }
  }

  if (lat != null) search.set("lat", String(lat));
  if (lon != null) search.set("lon", String(lon));

  const query = search.toString();
  const basePath = normalizedSort === "nearest" ? "/listings" : "/cars";
  const path = query ? `${basePath}?${query}` : basePath;
  return getJSON(path);
}

// Map filters -> URLSearchParams
export function toParams(filters = {}, paging = {}) {
  const p = new URLSearchParams();
  const { page = 1, pageSize = 24, limit, offset, cursor, cursorMode } = paging;
  if (limit != null || offset != null) {
    if (limit != null) p.set("limit", String(limit));
    if (offset != null) p.set("offset", String(offset));
  } else {
    p.set("page", String(page));
    p.set("page_size", String(pageSize));
  }
  if (cursor != null && String(cursor).trim()) {
    p.set("cursor", String(cursor).trim());
  }
  if (cursorMode) {
    p.set("cursor_mode", "1");
  }

  // Filters
  if (filters.q) p.set("q", filters.q);
  if (filters.source) p.set("source", filters.source);
  if (filters.vin) p.set("vin", filters.vin);
  if (filters.make) p.set("make", filters.make);
  if (filters.model) p.set("model", filters.model);
  if (filters.yearMin) p.set("year_min", String(filters.yearMin));
  if (filters.yearMax) p.set("year_max", String(filters.yearMax));
  if (filters.priceMin) p.set("price_min", String(filters.priceMin));
  if (filters.priceMax) p.set("price_max", String(filters.priceMax));
  if (filters.dealershipId) p.set("dealership_id", String(filters.dealershipId));
  if (filters.bodyType) p.set("body_type", filters.bodyType);
  if (filters.drivetrain) p.set("drivetrain", filters.drivetrain);
  if (filters.exteriorColor) p.set("exterior_color", filters.exteriorColor);
  if (filters.transmission) p.set("transmission", filters.transmission);
  if (filters.sort) p.set("sort", filters.sort); // pass-through sort key
  if (filters.saleType) p.set("type", filters.saleType);
  if (filters.status) p.set("status", filters.status);
  if (filters.freshHours != null) p.set("fresh_hours", String(filters.freshHours));
  if (filters.lat != null) p.set("lat", String(filters.lat));
  if (filters.lng != null) p.set("lng", String(filters.lng));
  if (filters.maxDistance != null) p.set("max_distance", String(filters.maxDistance));

  return p;
}

// Fetch one page
export async function getCars(filters = {}, paging = {}, options = {}) {
  const signal = options?.signal;
  const url = new URL(`${BASE}${API_PREFIX}/cars`);
  url.search = toParams(filters, paging).toString();
  const res = await fetch(url.toString(), {
    headers: buildHeaders(),
    signal,
  });
  if (!res.ok) throw new Error(`GET /cars ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) {
    return {
      items: data,
      total: data.length,
      page: paging.page ?? 1,
      pageSize: paging.pageSize ?? data.length,
      cursorMode: false,
      nextCursor: null,
      hasMore: false,
    };
  }
  const items = Array.isArray(data.items) ? data.items : [];
  const total =
    typeof data.total === "number" ? data.total : data.total == null ? null : items.length;
  const nextCursor =
    typeof data.next_cursor === "string" && data.next_cursor.trim()
      ? data.next_cursor.trim()
      : null;
  return {
    items,
    total,
    page: data.page ?? paging.page ?? 1,
    pageSize: data.page_size ?? paging.pageSize ?? items.length,
    cursorMode: Boolean(data.cursor_mode),
    nextCursor,
    hasMore: Boolean(data.has_more),
  };
}

export function lookupZip(zip) {
  const raw = zip == null ? "" : String(zip);
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("ZIP code required");
  return getJSON(`/geo/zip/${encodeURIComponent(trimmed)}`);
}

export function getCommentCount(carId) {
  if (carId == null) throw new Error("carId required");
  const id = encodeURIComponent(String(carId));
  return getJSON(`/cars/${id}/comments/count`);
}

export function getComments(carId) {
  if (carId == null) throw new Error("carId required");
  const id = encodeURIComponent(String(carId));
  return getJSON(`/cars/${id}/comments`);
}

export function submitComment(carId, payload = {}) {
  if (carId == null) throw new Error("carId required");
  const id = encodeURIComponent(String(carId));
  const body = { ...payload };
  if (body.parentId != null && body.parent_id == null) {
    body.parent_id = body.parentId;
    delete body.parentId;
  }
  return postJSON(`/cars/${id}/comments`, body);
}

export function reactToComment(commentId, payload) {
  if (commentId == null) throw new Error("commentId required");
  const id = encodeURIComponent(String(commentId));
  return postJSON(`/comments/${id}/reactions`, payload);
}

export function setCarLike(carId, liked) {
  if (carId == null) throw new Error("carId required");
  const id = String(carId).trim();
  if (!id) throw new Error("carId required");
  return postJSON(`/cars/${encodeURIComponent(id)}/likes`, { liked: Boolean(liked) });
}
