"""Router that re-exports the admin endpoints from the monolithic app."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.routing import APIRoute

# ``backend.admin`` can be executed both as part of the monolithic ``backend``
# package (e.g. ``backend.admin.routes``) and as a top-level ``admin`` package
# during deployment. Import the monolith application accordingly and fall back
# to ensuring the project root is on ``sys.path`` when necessary.
try:  # pragma: no cover - exercised in deployment
    if __package__ and __package__.startswith("backend."):
        from .. import app as monolith_app  # type: ignore[import-not-found]
    else:
        from backend import app as monolith_app  # pragma: no cover
except (ImportError, ModuleNotFoundError):  # pragma: no cover - deployment only
    import sys
    from pathlib import Path

    project_root = Path(__file__).resolve().parents[2]
    project_root_str = str(project_root)
    if project_root_str not in sys.path:
        sys.path.append(project_root_str)

    from backend import app as monolith_app  # type: ignore[import-not-found]

router = APIRouter(prefix="/admin")

for existing_route in list(monolith_app.app.routes):
    if not isinstance(existing_route, APIRoute):
        continue
    path = existing_route.path or ""
    if not path.startswith("/admin"):
        continue
    sub_path = path[len("/admin") :]
    if not sub_path:
        sub_path = "/"
    router.add_api_route(
        sub_path,
        existing_route.endpoint,
        methods=list(existing_route.methods or []),
        response_model=existing_route.response_model,
        status_code=existing_route.status_code,
        response_class=existing_route.response_class,
        name=existing_route.name,
        include_in_schema=existing_route.include_in_schema,
        dependencies=existing_route.dependencies,
        summary=existing_route.summary,
        description=existing_route.description,
        response_description=existing_route.response_description,
        responses=existing_route.responses,
        tags=list(existing_route.tags or []),
    )

__all__ = ["router"]
