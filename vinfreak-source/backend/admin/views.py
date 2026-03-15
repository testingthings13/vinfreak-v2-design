from datetime import datetime, timedelta, timezone
from typing import List, Any
import csv
from io import StringIO

from sqladmin import ModelView, expose
from wtforms import FileField, BooleanField
from starlette.requests import Request
from starlette.responses import Response, PlainTextResponse, HTMLResponse

try:  # pragma: no cover - prefer explicit package import
    from backend.models import Car, Dealership, Make, Model, Category
except ModuleNotFoundError:  # pragma: no cover - fallback when executed as script
    from models import Car, Dealership, Make, Model, Category
from backend.backend_settings import settings
try:
    from storage import save_upload, delete_upload
except ModuleNotFoundError:  # pragma: no cover - fallback when running as package
    from backend.storage import save_upload, delete_upload
try:
    from backend.db import engine
except ModuleNotFoundError:  # pragma: no cover - fallback for script execution
    from db import engine
from sqlmodel import Session, select, func
from markupsafe import Markup


AUCTION_STATUS_FIELD = getattr(Car, "auction_status", "auction_status")


def _logo_formatter(obj, attr):
    url = getattr(obj, "logo_url", None)
    if not url:
        return ""
    name = getattr(obj, "name", "") or "logo"
    return Markup(
        f'<img src="{url}" alt="{name} logo" class="admin-logo" loading="lazy">'
    )

def _csv_response(filename: str, rows: List[dict]) -> Response:
    buf = StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()) if rows else [])
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    return Response(
        buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

class CarAdmin(ModelView, model=Car):
    name = "Car"
    name_plural = "Cars"
    icon = "fa-solid fa-car"

    column_list = [Car.id, Car.year, Car.make, Car.model, Car.dealership_id, Car.vin, Car.source, Car.url]
    column_sortable_list = [Car.year, Car.make, Car.model, Car.source]
    column_searchable_list = [Car.vin, Car.make, Car.model, Car.source]
    column_default_sort = ("id", True)

    column_formatters = {
        Car.url: lambda m, a: f'<a href="{m.url}" target="_blank">Open</a>' if m.url else "",
        Car.source: lambda m, a: f'<span class="badge source {(m.source or "unknown").lower()}">{m.source or "unknown"}</span>',
        Car.dealership_id: lambda m, a: f'<span class="badge dealership">{m.dealership.name}</span>' if m.dealership else "",
    }

    column_filters = [Car.source, Car.make, Car.year, Car.dealership_id]

    column_labels = {Car.dealership_id: "Dealership"}

    form_columns = [
        Car.vin,
        Car.year,
        "make_rel",
        "model_rel",
        "category_rel",
        Car.trim,
        Car.price,
        Car.mileage,
        Car.currency,
        Car.city,
        Car.state,
        AUCTION_STATUS_FIELD,
        Car.lot_number,
        Car.source,
        Car.url,
        Car.title,
        Car.image_url,
        Car.highlights,
        Car.description,
        Car.seller_name,
        Car.seller_rating,
        Car.seller_reviews,
        Car.posted_at,
        "dealership",
    ]
    form_ajax_refs = {
        "dealership": {"fields": (Dealership.name,)},
        "make_rel": {"fields": (Make.name,)},
        "model_rel": {"fields": (Model.name,)},
        "category_rel": {"fields": (Category.name,)},
    }

    def _normalize_ids(self, data: dict) -> None:
        for key in ("make_id", "model_id", "category_id", "dealership_id"):
            if data.get(key) in ("", None):
                data[key] = None

    def _sync_names(self, data: dict) -> None:
        with Session(engine) as s:
            if data.get("make_id"):
                m = s.get(Make, data["make_id"])
                data["make"] = m.name if m else None
            if data.get("model_id"):
                m = s.get(Model, data["model_id"])
                data["model"] = m.name if m else None

    async def insert_model(self, request, data):
        self._normalize_ids(data)
        self._sync_names(data)
        return await super().insert_model(request, data)

    async def update_model(self, request, pk, data):
        self._normalize_ids(data)
        self._sync_names(data)
        return await super().update_model(request, pk, data)

    async def action_export_csv(self, ids: List[Any]) -> Response:
        if not ids:
            return PlainTextResponse("No rows selected.", status_code=400)
        with Session(engine) as s:
            items = s.exec(select(Car).where(Car.id.in_(ids))).all()
        rows = [{
            "id": str(i.id),
            "year": i.year,
            "make": i.make,
            "model": i.model,
            "vin": i.vin,
            "source": i.source,
            "url": i.url,
            "created_at": i.created_at.isoformat() if getattr(i, "created_at", None) else ""
        } for i in items]
        return _csv_response("cars_export.csv", rows)

    async def action_delete_selected(self, ids: List[Any]) -> Response:
        if not ids:
            return PlainTextResponse("No rows selected.", status_code=400)
        with Session(engine) as s:
            items = s.exec(select(Car).where(Car.id.in_(ids))).all()
            for i in items:
                s.delete(i)
            s.commit()
        return PlainTextResponse(f"Deleted {len(ids)} item(s).")

    actions = [("Export CSV", "action_export_csv"), ("Delete selected", "action_delete_selected")]


class DealershipAdmin(ModelView, model=Dealership):
    name = "Dealership"
    name_plural = "Dealerships"
    icon = "fa-solid fa-building"

    column_list = [Dealership.id, Dealership.name, Dealership.location, Dealership.logo_url]
    form_columns = [Dealership.name, Dealership.location, "logo_file", "remove_logo"]
    form_extra_fields = {
        "logo_file": FileField("Logo"),
        "remove_logo": BooleanField("Remove current logo"),
    }
    column_formatters = {
        Dealership.logo_url: _logo_formatter,
    }

    async def _handle_logo(self, data: dict, obj: Dealership | None = None):
        remove = data.pop("remove_logo", False)
        file = data.pop("logo_file", None)
        current_logo = getattr(obj, "logo_url", None) if obj else None
        if obj and (remove or (file and getattr(file, "filename", None))) and current_logo:
            delete_upload(current_logo)
        if remove:
            data["logo_url"] = None
        elif file and getattr(file, "filename", None):
            uploaded = save_upload(file, category="dealerships")
            if uploaded:
                data["logo_url"] = uploaded

    async def insert_model(self, request, data):
        await self._handle_logo(data)
        return await super().insert_model(request, data)

    async def update_model(self, request, pk, data):
        with Session(engine) as s:
            obj = s.get(Dealership, pk)
        await self._handle_logo(data, obj)
        return await super().update_model(request, pk, data)


class MakeAdmin(ModelView, model=Make):
    name = "Make"
    name_plural = "Makes"
    icon = "fa-solid fa-industry"

    column_list = [Make.id, Make.name, Make.logo_url]
    form_columns = [Make.name, "logo_file", "remove_logo"]
    form_extra_fields = {
        "logo_file": FileField("Logo"),
        "remove_logo": BooleanField("Remove current logo"),
    }
    column_formatters = {
        Make.logo_url: _logo_formatter,
    }

    async def _handle_logo(self, data: dict, obj: Make | None = None):
        remove = data.pop("remove_logo", False)
        file = data.pop("logo_file", None)
        current = getattr(obj, "logo_url", None) if obj else None
        if obj and (remove or (file and getattr(file, "filename", None))) and current:
            delete_upload(current)
        if remove:
            data["logo_url"] = None
        elif file and getattr(file, "filename", None):
            uploaded = save_upload(file, category="logos")
            if uploaded:
                data["logo_url"] = uploaded

    async def insert_model(self, request, data):
        await self._handle_logo(data)
        return await super().insert_model(request, data)

    async def update_model(self, request, pk, data):
        with Session(engine) as s:
            obj = s.get(Make, pk)
        await self._handle_logo(data, obj)
        return await super().update_model(request, pk, data)


class ModelAdmin(ModelView, model=Model):
    name = "Model"
    name_plural = "Models"
    icon = "fa-solid fa-car-side"

    column_list = [Model.id, Model.name, Model.make_id]
    form_columns = [Model.name, "make"]
    form_ajax_refs = {
        "make": {"fields": (Make.name,)},
    }


class CategoryAdmin(ModelView, model=Category):
    name = "Category"
    name_plural = "Categories"
    icon = "fa-solid fa-tags"

    column_list = [Category.id, Category.name]
    form_columns = [Category.name]

class DashboardView(ModelView):
    name = "FreakOps"
    icon = "fa-solid fa-gauge"

    @expose("/dashboard", methods=["GET"])
    async def dashboard(self, request: Request) -> HTMLResponse:
        with Session(engine) as s:
            total = s.exec(select(func.count()).select_from(Car)).one()
            by_source = s.exec(select(Car.source, func.count()).group_by(Car.source)).all()
            since = datetime.now(timezone.utc) - timedelta(days=7)
            last7 = s.exec(select(func.count()).where(Car.created_at >= since)).one()

        html = """
        <div class="kpi-grid">
          <div class="kpi"><div class="kpi-label">Total Cars</div><div class="kpi-value">{total}</div></div>
          <div class="kpi"><div class="kpi-label">New (7 days)</div><div class="kpi-value">{last7}</div></div>
        </div>
        <div class="card">
          <h3>By Source</h3>
          <table class="table">
            <thead><tr><th>Source</th><th>Count</th></tr></thead>
            <tbody>{rows}</tbody>
          </table>
        </div>
        """.format(
            total=total or 0,
            last7=last7 or 0,
            rows="".join(
                f'<tr><td><span class="badge source {(src or "unknown").lower()}">{src or "unknown"}</span></td><td>{cnt}</td></tr>'
                for src, cnt in by_source
            )
        )
        return HTMLResponse(html)
