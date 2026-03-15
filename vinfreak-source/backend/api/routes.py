"""Utilities for constructing the public API router."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter


def create_router(app_module: Any) -> APIRouter:
    """Build an API router using handlers from ``app_module``."""

    router = APIRouter(prefix="/api")

    router.add_api_route("/geo/zip/{postal_code}", app_module.lookup_zip, methods=["GET"])
    router.add_api_route("/geo/ip", app_module.lookup_ip, methods=["GET"])
    router.add_api_route("/cars", app_module.list_cars, methods=["GET"])
    router.add_api_route("/listings", app_module.list_cars, methods=["GET"])
    router.add_api_route("/cars/{id}", app_module.get_car, methods=["GET"])
    router.add_api_route(
        "/cars/{car_id}/comments",
        app_module.get_car_comments,
        methods=["GET"],
    )
    router.add_api_route(
        "/cars/{car_id}/comments/count",
        app_module.get_car_comment_count,
        methods=["GET"],
    )
    router.add_api_route(
        "/cars/{car_id}/comments",
        app_module.create_car_comment,
        methods=["POST"],
    )
    router.add_api_route(
        "/comments/{comment_id}/reactions",
        app_module.react_to_comment,
        methods=["POST"],
    )
    router.add_api_route(
        "/cars/{car_id}/likes",
        app_module.update_car_like,
        methods=["POST"],
    )
    router.add_api_route(
        "/freakstats/insights",
        app_module.generate_freakstats_insights,
        methods=["POST"],
    )
    router.add_api_route(
        "/grok/ask-seller",
        app_module.generate_ask_seller_email,
        methods=["POST"],
    )
    router.add_api_route("/dealerships", app_module.list_dealerships, methods=["GET"])
    router.add_api_route("/makes", app_module.list_makes, methods=["GET"])
    router.add_api_route(
        "/dealership/apply",
        app_module.dealer_apply_api,
        methods=["POST"],
        response_model=app_module.DealerApplicationResult,
    )
    router.add_api_route(
        "/public/site-password",
        app_module.public_site_password_check,
        methods=["POST"],
        response_model=app_module.SitePasswordResult,
    )
    router.add_api_route(
        "/public/settings",
        app_module.public_settings,
        methods=["GET"],
    )
    router.add_api_route(
        "/integrations/facebook/marketplace/import",
        app_module.import_facebook_marketplace,
        methods=["POST"],
    )
    router.add_api_route(
        "/integrations/slack/commands/run",
        app_module.run_slack_command,
        methods=["POST"],
    )
    router.add_api_route(
        "/integrations/slack/commands/help",
        app_module.run_slack_command,
        methods=["POST"],
    )
    router.add_api_route(
        "/integrations/slack/commands/stats",
        app_module.run_slack_command,
        methods=["POST"],
    )

    return router


__all__ = ["create_router"]
