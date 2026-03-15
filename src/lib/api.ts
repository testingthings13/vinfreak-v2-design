const API_BASE = "https://api.vinfreak.com";
const API_PREFIX = "/api";

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json", ...extra };
  return headers;
}

async function getJSON<T = any>(path: string, timeoutMs = 12000): Promise<T> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const fullPath = normalized.startsWith(API_PREFIX) ? normalized : `${API_PREFIX}${normalized}`;
  const url = `${API_BASE}${fullPath}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: buildHeaders(), signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} • ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } catch (e: any) {
    if (e.name === "AbortError") throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function postJSON<T = any>(path: string, body: any = {}, timeoutMs = 15000): Promise<T> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const fullPath = normalized.startsWith(API_PREFIX) ? normalized : `${API_PREFIX}${normalized}`;
  const url = `${API_BASE}${fullPath}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: buildHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`POST ${url} ${res.status} • ${text.slice(0, 200)}`);
    if (!text) return null as any;
    return JSON.parse(text);
  } catch (e: any) {
    if (e.name === "AbortError") throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// ─── Public endpoints ───

export function getSettings() {
  return getJSON("/public/settings");
}

export function getDealerships() {
  return getJSON("/dealerships");
}

export function getMakes() {
  return getJSON("/makes");
}

export interface FetchListingsParams {
  sort?: string;
  saleType?: string;
  limit?: number;
  offset?: number;
  lat?: number | null;
  lon?: number | null;
  [key: string]: any;
}

export async function fetchListings(params: FetchListingsParams = {}) {
  const { sort = "recent", saleType, limit = 50, offset = 0, lat, lon, ...extras } = params;
  const search = new URLSearchParams();
  search.set("sort", sort);
  if (limit != null) search.set("limit", String(limit));
  if (offset != null) search.set("offset", String(offset));
  if (saleType) search.set("type", saleType);
  if (lat != null) search.set("lat", String(lat));
  if (lon != null) search.set("lon", String(lon));
  for (const [key, value] of Object.entries(extras)) {
    if (value != null && value !== "") search.set(key, String(value));
  }
  const basePath = sort === "nearest" ? "/listings" : "/cars";
  return getJSON(`${basePath}?${search.toString()}`);
}

export interface GetCarsFilters {
  q?: string;
  source?: string;
  make?: string;
  model?: string;
  yearMin?: number;
  yearMax?: number;
  priceMin?: number;
  priceMax?: number;
  dealershipId?: string;
  transmission?: string;
  sort?: string;
  saleType?: string;
  status?: string;
  lat?: number;
  lng?: number;
}

export interface GetCarsPaging {
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
}

export async function getCars(filters: GetCarsFilters = {}, paging: GetCarsPaging = {}, signal?: AbortSignal) {
  const p = new URLSearchParams();
  const { page = 1, pageSize = 24, limit, offset } = paging;
  if (limit != null || offset != null) {
    if (limit != null) p.set("limit", String(limit));
    if (offset != null) p.set("offset", String(offset));
  } else {
    p.set("page", String(page));
    p.set("page_size", String(pageSize));
  }

  if (filters.q) p.set("q", filters.q);
  if (filters.source) p.set("source", filters.source);
  if (filters.make) p.set("make", filters.make);
  if (filters.model) p.set("model", filters.model);
  if (filters.yearMin) p.set("year_min", String(filters.yearMin));
  if (filters.yearMax) p.set("year_max", String(filters.yearMax));
  if (filters.priceMin) p.set("price_min", String(filters.priceMin));
  if (filters.priceMax) p.set("price_max", String(filters.priceMax));
  if (filters.dealershipId) p.set("dealership_id", filters.dealershipId);
  if (filters.transmission) p.set("transmission", filters.transmission);
  if (filters.sort) p.set("sort", filters.sort);
  if (filters.saleType) p.set("type", filters.saleType);
  if (filters.status) p.set("status", filters.status);
  if (filters.lat != null) p.set("lat", String(filters.lat));
  if (filters.lng != null) p.set("lng", String(filters.lng));

  const url = `${API_BASE}${API_PREFIX}/cars?${p.toString()}`;
  const res = await fetch(url, { headers: buildHeaders(), signal });
  if (!res.ok) throw new Error(`GET /cars ${res.status}`);
  const data = await res.json();

  if (Array.isArray(data)) {
    return { items: data, total: data.length, page, pageSize: data.length, hasMore: false };
  }
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    items,
    total: typeof data.total === "number" ? data.total : items.length,
    page: data.page ?? page,
    pageSize: data.page_size ?? pageSize,
    hasMore: Boolean(data.has_more),
    nextCursor: data.next_cursor || null,
  };
}

export function getCarById(id: string) {
  return getJSON(`/cars/${encodeURIComponent(id)}`);
}

export function getComments(carId: string) {
  return getJSON(`/cars/${encodeURIComponent(carId)}/comments`);
}

export function getCommentCount(carId: string) {
  return getJSON(`/cars/${encodeURIComponent(carId)}/comments/count`);
}

export function submitComment(carId: string, payload: { text: string; author?: string; parent_id?: string }) {
  return postJSON(`/cars/${encodeURIComponent(carId)}/comments`, payload);
}

export function setCarLike(carId: string, liked: boolean) {
  return postJSON(`/cars/${encodeURIComponent(carId)}/likes`, { liked });
}

export function reactToComment(commentId: string, reaction: string) {
  return postJSON(`/comments/${encodeURIComponent(commentId)}/reactions`, { reaction });
}

export function lookupZip(zip: string) {
  return getJSON(`/geo/zip/${encodeURIComponent(zip.trim())}`);
}

export function lookupIp(ip?: string) {
  const path = ip ? `/geo/ip?ip=${encodeURIComponent(ip)}` : "/geo/ip";
  return getJSON(path);
}
