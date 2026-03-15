from .base import BaseImporter


class AutotraderImporter(BaseImporter):
    """Placeholder importer for AutoTrader listings."""

    def normalize(self, item: dict) -> dict | None:  # pragma: no cover - placeholder
        # Real implementation should convert ``item`` into our normalized car format.
        return None
