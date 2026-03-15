from importlib import import_module
from typing import Type

from .base import BaseImporter

# Mapping of dealership name to importer class name
_IMPORTERS = {
    "carsandbids": "CarsAndBidsImporter",
    # additional dealerships can be added here
    "autotrader": "AutotraderImporter",
    "neurowraith": "NeuroWraithImporter",
}

def get_importer(dealership_name: str) -> BaseImporter:
    """Return an importer instance for the given dealership name."""
    key = dealership_name.lower()
    cls_name = _IMPORTERS.get(key)
    if not cls_name:
        raise KeyError(f"Unknown dealership: {dealership_name}")
    module = import_module(f"{__name__}.{key}")
    cls: Type[BaseImporter] = getattr(module, cls_name)
    if not issubclass(cls, BaseImporter):
        raise TypeError(f"{cls_name} is not a subclass of BaseImporter")
    return cls()

__all__ = ["get_importer", "BaseImporter"]
