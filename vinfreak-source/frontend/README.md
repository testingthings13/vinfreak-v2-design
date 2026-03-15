# VINFREAK Frontend (React + Vite)

Single-page app for browsing VINFREAK inventory, gated by a soft password and backed by the public JSON API.

## Features
- Home/search: text + make/model + dealership + drivetrain/body/color/transmission filters, price/year sliders, sorting, pagination, KPI chips, skeleton loading.
- Responsive cards and car detail pages with hero media, auction countdown, price/mileage/location stats, spec grid (VIN copy), galleries, highlights/equipment/modifications/flaws/service/notes.
- Comments modal with counts/badges; likes and global toasts for feedback.
- Soft password gate validated via `/public/site-password`, stored as a versioned token in `localStorage`.

## Development
1) `npm install`  
2) `npm run dev`  
3) Open the Vite dev server URL printed in the console.

Tests
- `npm test`

Environment
- `VITE_API_BASE` (optional) - override the default API origin in `src/api.js`.
