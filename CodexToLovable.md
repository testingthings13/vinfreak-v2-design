# CodexToLovable: VINFREAK Site V2 (`vinfreak-v2-design`)

This file explains how Site V2 works so Lovable can modify it safely.

## 1) Scope and intent

- This repo is the public V2 storefront UI.
- Keep all work inside this repo (`V2/site` in monorepo context).
- Do not change backend contract unless explicitly requested.

## 2) Stack and runtime

- React + TypeScript + Vite + Tailwind + shadcn UI.
- Entry app routes in `src/App.tsx`:
  - `/` -> listings page (`src/pages/Index.tsx`)
  - `/cars/:id` -> car detail page (`src/pages/CarDetail.tsx`)

## 3) API wiring (critical)

- Main API client: `src/lib/api.ts`
- Base URL:
  - `VITE_API_BASE` env var (default `https://api.vinfreak.com`)
  - API prefix is always `/api`
- Most reads/writes are JSON:
  - Listings: `GET /api/cars`
  - Car detail: `GET /api/cars/:id`
  - Comments: `GET/POST /api/cars/:id/comments`
  - Comment count: `GET /api/cars/:id/comments/count`
  - Likes: `POST /api/cars/:id/likes`
  - Reactions: `POST /api/comments/:id/reactions`

## 4) Listings page behavior (`src/pages/Index.tsx`)

- URL query params are source of truth via `useSearchFilters`:
  - `q`, `make`, `model`, `yearMin`, `yearMax`, `priceMin`, `priceMax`, `transmission`, `source`, `sort`, `saleType`, `page`
- Debounced fetch (`400ms`) with TanStack Query.
- Sort mapping logic (important):
  - `facebook_marketplace` and `pca` UI sorts map to API `sort=recent` with `source` set.
  - `manual` maps to `sort=recent` plus `transmission=Manual`.
  - `nearest` requests browser geolocation and sends `lat/lng`; if no coords, falls back to `recent`.
- If API fetch fails, listings fall back to local `mockCars`.

## 5) Car card interactions

- Card rendering + interactions: `src/components/CarCard.tsx`
- Likes:
  - Uses `useCarLike` and `POST /api/cars/:id/likes`.
  - Like is optimistic and stored in `sessionStorage`.
  - Only numeric IDs are used for like/comment APIs (`/^\d+$/` check).
- Comments:
  - Modal in `src/components/CommentsModal.tsx`.
  - Fetch comments, add comment/reply, react to comment.
  - Keeps comment count in sync via `useCommentCount`.
- Share:
  - Uses Web Share API first, clipboard fallback.

## 6) Car detail page behavior

- Detail page requests `getCarById(id)`.
- If API response is missing/fails, page can fall back to `mockCars`.
- Detail displays images/specs/source links and pricing state (live/sold/auction).

## 7) Data normalization layer

- `src/lib/normalizeCar.ts` is the compatibility layer between mixed backend payloads and UI components.
- It normalizes:
  - status (`LIVE`, `SOLD`, `AUCTION_IN_PROGRESS`)
  - location, transmission tag, images, likes, estimated value, dealership metadata.
- Do not bypass this layer unless backend schema is finalized.

## 8) Environment and deploy assumptions

- Local dev:
  - `npm i`
  - `npm run dev`
- Staging domain:
  - `https://v2staging.vinfreak.com`
- Docker staging build receives:
  - `VITE_API_BASE` from `V2_SITE_API_BASE` (see `V2/deploy/staging/docker-compose.yml`)

## 9) What is live vs fallback

- Live API is used for listings/detail/comments/likes.
- Mock fallback still exists for resilience and design continuity when API calls fail.

## 10) Lovable guardrails for changes

- Preserve URL-query-driven filters and pagination.
- Keep `/api` prefix behavior in `src/lib/api.ts`.
- Keep current sort-to-API mapping behavior unless product explicitly changes.
- Keep graceful fallback UX (loading, empty, error fallback).
- If backend endpoint changes are needed, document them first instead of silently changing contracts.
