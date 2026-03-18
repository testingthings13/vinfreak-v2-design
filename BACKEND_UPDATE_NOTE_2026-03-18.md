# Backend Update Note (2026-03-18)

This mirror repo was updated to match the V2/site integration fixes in the monorepo source of truth:

- Source-of-truth repo: `testingthings13/vinfreakdev`
- Source path: `V2/site`

## Synced frontend fixes

- API base/env handling now supports `VITE_API_BASE` with fallback to `https://api.vinfreak.com`.
- Shared URL builders are used for API/public/share paths.
- Fetch requests include `credentials: "include"` to support backend session-based behavior where required.
- Comment submissions map to backend contract (`body`, optional `name`/`email`/`parent_id`).
- FREAKStats request payload updated to `{ url, car: {...} }` format expected by backend.
- Ask Seller request now validates/uses absolute listing URL as required by backend endpoint.
- Hardcoded host references in card/detail/logo/share paths were replaced with centralized URL helpers.

## Backend notes

- No backend code was changed in this mirror repo.
- Remaining backend/API enhancement work is tracked in the monorepo under:
  - `V2/admin/docs/BACKEND_JSON_GAPS.md`
