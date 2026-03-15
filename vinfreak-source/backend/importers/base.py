from abc import ABC, abstractmethod


class BaseImporter(ABC):
    """Base class for all dealership importers."""

    @abstractmethod
    def normalize(self, item: dict) -> dict | None:
        """Normalize a raw item into a canonical car record."""
        raise NotImplementedError
