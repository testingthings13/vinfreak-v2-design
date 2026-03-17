# FOR CODEX — VINFREAK V2 Frontend Architecture & Merge Guide

> This document is written for AI coding agents (OpenAI Codex, etc.) to understand the project structure, conventions, and how to safely merge or extend this codebase.

---

## 1. Project Overview

**VINFREAK** is an exotic car marketplace aggregator. This repo is the **V2 React frontend** that connects to a production FastAPI backend at `https://api.vinfreak.com`. There is no backend code in this repo — all data comes from REST API calls.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS + shadcn/ui components |
| Data Fetching | TanStack React Query (v5) |
| Routing | React Router v6 |
| Animations | Framer Motion |
| Icons | Lucide React |
| State | URL params (filters), localStorage (favorites, compare, recently viewed), React Query cache |

---

## 2. Directory Structure

```
src/
├── assets/          # Static images (hero-bg.jpg, etc.)
├── components/      # Reusable UI components
│   ├── ui/          # shadcn/ui primitives (Button, Toaster, etc.)
│   ├── CarCard.tsx          # Listing card for grid
│   ├── CarCardSkeleton.tsx  # Loading placeholder
│   ├── CommentsModal.tsx    # Comment thread modal (portal)
│   ├── CompareDrawer.tsx    # Sticky compare tray
│   ├── DetailSections.tsx   # Car detail expandable sections
│   ├── FilterPanel.tsx      # Advanced filter accordion
│   ├── Footer.tsx
│   ├── FreakStatsModal.tsx  # AI insights modal (portal)
│   ├── AskSellerModal.tsx   # AI email generator modal (portal)
│   ├── Gallery.tsx          # Image gallery with thumbnails
│   ├── Layout.tsx           # Header + main wrapper
│   ├── RecentlyViewed.tsx   # Horizontal scroll strip
│   ├── ScrollToTop.tsx      # Scroll-to-top FAB
│   ├── SpecGrid.tsx         # Specs 2-column grid
│   └── TrendingCarousel.tsx # "Hot Right Now" carousel
├── hooks/
│   ├── useCarLike.ts        # Like/unlike with optimistic updates
│   ├── useCommentCount.ts   # Comment count fetcher
│   ├── useCompare.ts        # Compare list (localStorage, max 3)
│   ├── useDebounce.ts       # Debounce helper
│   ├── useFavorites.ts      # Wishlist (localStorage)
│   ├── useGeolocation.ts    # Browser geolocation for "Nearest"
│   ├── useRecentlyViewed.ts # Recently viewed (localStorage, max 12)
│   ├── useSearchFilters.ts  # URL-driven filter state
│   └── useShare.ts          # Web Share API / clipboard fallback
├── lib/
│   ├── api.ts               # HTTP client (getJSON, postJSON, all endpoints)
│   ├── normalizeCar.ts      # Raw API → NormalizedCar transform (326 lines)
│   └── utils.ts             # cn() classname merge utility
├── pages/
│   ├── Index.tsx             # Homepage: hero, trending, filters, grid, load-more
│   ├── CarDetail.tsx         # Single listing: gallery, specs, sidebar, modals
│   ├── Favorites.tsx         # /favorites — saved cars
│   ├── Compare.tsx           # /compare — side-by-side comparison
│   ├── Share.tsx             # /share/:id — shareable car page
│   └── NotFound.tsx
├── App.tsx                   # Routes + providers
├── main.tsx                  # Entry point
└── index.css                 # Global styles, design tokens, custom classes
```

---

## 3. API Integration

### Base URL
```
https://api.vinfreak.com/api
```

### Key Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/cars?page=N&page_size=24&sort=X&...` | Paginated car listings |
| GET | `/cars/:id` | Single car detail |
| GET | `/cars/:id/comments` | Comments thread |
| GET | `/cars/:id/comments/count` | Comment count |
| POST | `/cars/:id/comments` | Submit comment |
| POST | `/cars/:id/likes` | Like/unlike |
| POST | `/comments/:id/reactions` | React to comment |
| POST | `/freakstats/insights` | AI car analysis |
| POST | `/grok/ask-seller` | AI email draft generator |
| GET | `/makes` | All car makes |
| GET | `/dealerships` | All dealerships |
| GET | `/geo/zip/:zip` | Zip code lookup |
| GET | `/geo/ip` | IP geolocation |
| GET | `/public/settings` | Site settings |

### API Client (`src/lib/api.ts`)

- `getJSON(path, timeoutMs)` — GET with abort controller
- `postJSON(path, body, timeoutMs)` — POST with JSON body
- All paths are auto-prefixed with `/api` if not already present
- No authentication headers (public API)

### Data Normalization (`src/lib/normalizeCar.ts`)

**CRITICAL**: Raw API responses must pass through `normalizeCar()` before rendering. This function:
- Resolves relative image URLs to absolute
- Detects auction status (`LIVE`, `AUCTION_IN_PROGRESS`, `SOLD`, `REMOVED`)
- Normalizes location strings (city + state abbreviation)
- Parses transmission type tags
- Extracts mileage/price as numbers
- Returns a typed `NormalizedCar` interface

---

## 4. State Management Patterns

### URL-Driven Filters (`useSearchFilters`)
All search/filter state lives in URL search params. This means:
- Filters survive page refresh
- Back/forward navigation works correctly
- `setFilters({ make: "BMW" })` merges into existing params
- `clearFilters()` resets all

### localStorage Stores
These hooks use localStorage with event-based cross-tab sync:
- **`useFavorites`** — `vinfreak_favorites` key, stores car IDs
- **`useCompare`** — `vinfreak_compare` key, max 3 cars
- **`useRecentlyViewed`** — `vinfreak_recently_viewed` key, max 12 entries (full car data)

### React Query
- Infinite query on homepage (`useInfiniteQuery` with `getNextPageParam`)
- Standard queries for car detail, trending, makes, etc.
- 60s stale time for listings, 5min for trending

---

## 5. Design System

### CSS Variables (HSL)
All colors are defined as HSL values in `index.css` under `:root` and `.dark`. Components use Tailwind semantic tokens:
```
bg-background, text-foreground, bg-card, border-border,
bg-primary, text-primary-foreground, bg-muted, text-muted-foreground,
bg-accent, text-accent-foreground, bg-destructive, text-destructive-foreground
```

**NEVER** use raw color values (`text-white`, `bg-black`) in components. Always use semantic tokens.

### Custom CSS Classes
Defined in `index.css`:
- `.filter-chip`, `.filter-chip.active` — filter toggle buttons
- `.car-chip`, `.car-chip.interactive` — action chips (like, share, comment)
- `.badge-auction`, `.badge-sold`, `.badge-for-sale` — status badges
- `.freakstats-btn` — AI CTA button
- `.trending-section`, `.trending-card` — trending carousel
- `.recently-viewed-section`, `.recently-viewed-card` — recently viewed strip
- `.sticky-search` — sticky search bar after hero scroll
- `.results-header` — results count bar

---

## 6. Routing

```typescript
/                   → Index.tsx (homepage)
/cars/:id           → CarDetail.tsx
/car/:id            → CarDetail.tsx (alias)
/share/:id          → Share.tsx
/share-ui/:id       → Share.tsx (alias)
/favorites          → Favorites.tsx
/compare            → Compare.tsx
*                   → NotFound.tsx
```

---

## 7. Key Patterns for Merging

### Adding a New Page
1. Create `src/pages/NewPage.tsx`
2. Add route in `src/App.tsx`
3. Add nav link in `src/components/Layout.tsx` if needed

### Adding a New API Endpoint
1. Add the function in `src/lib/api.ts`
2. Use `getJSON` or `postJSON` — they handle timeouts and path prefixing

### Adding a New Component
1. Create in `src/components/`
2. Use semantic Tailwind tokens (not raw colors)
3. For modals, use `createPortal(content, document.body)` pattern (see FreakStatsModal, AskSellerModal)

### Adding a New Hook
1. Create in `src/hooks/`
2. For localStorage-backed state, follow the pattern in `useFavorites.ts` (storage event listener for cross-tab sync)

### Modifying the Car Grid / Listings
- Homepage uses `useInfiniteQuery` with "Load More" button (NOT pagination)
- Cars are fetched 24 at a time via `getCars()` with `page` param
- All raw API items must be passed through `normalizeCar()`

### Modifying Filters
- Filter state is URL-driven via `useSearchFilters`
- Sort options have special handling: `pca`, `facebook_marketplace`, `manual`, `nearest` map to different API params (see Index.tsx queryFn)

---

## 8. Reference Files from V1

The repo includes reference implementations from the V1 codebase:
- `vinfreak-source/frontend/src/grok.js` — Original Grok AI integration
- `vinfreakdev-main/frontend/src/grok.js` — Dev branch AI integration

These are **reference only** — do not import from them. The V2 equivalents are:
- `src/components/FreakStatsModal.tsx` (insights)
- `src/components/AskSellerModal.tsx` (ask seller email)

---

## 9. Build & Dev

```bash
npm install        # Install dependencies
npm run dev        # Vite dev server (port 8080)
npm run build      # Production build
npm run preview    # Preview production build
```

### Environment
- No `.env` file — API base URL is hardcoded in `src/lib/api.ts`
- No private keys in the frontend
- CORS is configured on the backend for Lovable preview + production domains

---

## 10. Important Warnings

1. **Do NOT add mock/dummy data** — the UI connects to live production API
2. **Do NOT change `API_BASE`** — it must remain `https://api.vinfreak.com`
3. **Do NOT use pagination** — homepage uses infinite scroll (Load More)
4. **Do NOT store roles/auth on client** — there is no auth system in V2 frontend
5. **Always normalize API data** — use `normalizeCar()` before rendering
6. **Use HSL semantic tokens** — never hardcode colors
7. **Modals use portals** — `createPortal(content, document.body)` pattern
8. **Image URLs may be relative** — `normalizeCar()` handles this, but if adding new image references, use the `toAbsolute()` pattern
