# Verification Checklist

This document captures the validation commands executed during the latest maintenance session.

## Backend
- `python3 -m compileall backend/app.py backend/integrations/facebook_marketplace_helpers.py`
- `python3 -m pytest tests/test_facebook_marketplace_helpers.py -q`
- `python3 -m pytest tests/test_facebook_marketplace_import.py tests/test_admin_facebook_marketplace.py -q` *(fails in this environment because only Python 3.9 is available; backend models use `|` union syntax that requires Python 3.10+ runtime without postponed evaluation in that module)*.
- `python3 - <<'PY' ...` FBM helper smoke checks (paging, cursor parsing, image ordering).

## Frontend
- `npm --prefix frontend test`
- `npm --prefix frontend ci`
- `npm --prefix frontend run build`

Frontend checks and backend compile/smoke checks completed successfully.
