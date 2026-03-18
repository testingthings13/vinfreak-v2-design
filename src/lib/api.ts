const DEFAULT_API_BASE = "https://api.vinfreak.com";
const API_PREFIX = "/api";

function normalizeBase(value: string | undefined | null): string {
  return String(value || "").trim().replace(/\/+$/, "");
}

export const API_BASE = normalizeBase(import.meta.env.VITE_API_BASE || "") || DEFAULT_API_BASE;

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function withApiPrefix(path: string): string {
  const normalized = normalizePath(path);
  return normalized.startsWith(API_PREFIX) ? normalized : `${API_PREFIX}${normalized}`;
}

export function buildApiUrl(path: string): string {
  return `${API_BASE}${withApiPrefix(path)}`;
}

export function buildPublicUrl(pathOrUrl: string): string {
  if (/^(https?:)?\/\//i.test(pathOrUrl) || /^data:/i.test(pathOrUrl)) return pathOrUrl;
  return `${API_BASE}${normalizePath(pathOrUrl)}`;
}

export function buildShareUrl(carId: string): string {
  return buildPublicUrl(`/share/${encodeURIComponent(carId)}`);
}

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json", ...extra };
  return headers;
}

export async function getJSON<T = any>(path: string, timeoutMs = 12000): Promise<T> {
  const url = buildApiUrl(path);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: buildHeaders(),
      signal: ctrl.signal,
      credentials: "include",
    });
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

export async function postJSON<T = any>(path: string, body: any = {}, timeoutMs = 15000): Promise<T> {
  const url = buildApiUrl(path);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: buildHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal: ctrl.signal,
      credentials: "include",
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

export function verifySitePassword(password: string) {
  return postJSON("/public/site-password", { password });
}

export function getDealerships() {
  return getJSON("/dealerships");
}

export function getMakes() {
  return getJSON("/makes");
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

  const url = buildApiUrl(`/cars?${p.toString()}`);
  const res = await fetch(url, {
    headers: buildHeaders(),
    signal,
    credentials: "include",
  });
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

export interface SubmitCommentPayload {
  text?: string;
  body?: string;
  author?: string;
  name?: string;
  email?: string;
  parent_id?: string | number;
}

export function submitComment(carId: string, payload: SubmitCommentPayload) {
  const body = String(payload.body ?? payload.text ?? "").trim();
  return postJSON(`/cars/${encodeURIComponent(carId)}/comments`, {
    body,
    name: payload.name ?? payload.author,
    email: payload.email,
    parent_id: payload.parent_id,
  });
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

export function getAdminSessionStatus() {
  return getJSON("/admin/session/status").catch(() => null);
}
