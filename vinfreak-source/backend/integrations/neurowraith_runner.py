from __future__ import annotations

from collections import deque
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

logger = logging.getLogger("vinfreak.neurowraith.runner")

DEFAULT_BRINGATRAILER_MAKES: tuple[str, ...] = (
    "BMW",
    "Mercedes",
    "Audi",
    "Volkswagen",
    "Porsche",
    "Ferrari",
    "Lamborghini",
    "McLaren",
    "Aston Martin",
    "Rolls Royce",
    "Bentley",
    "Subaru",
    "Alfa Romeo",
    "Maserati",
    "Tesla",
    "Rivian",
    "Bugatti",
    "Koenigsegg",
    "Pagani",
    "Lotus",
    "Jeep",
    "Land Rover",
)


class LocalNeuroWraithRunnerError(RuntimeError):
    """Raised when the local NeuroWraith runner cannot execute a spider."""


def _bool_from_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    if value in {"1", "true", "yes", "y", "on"}:
        return True
    if value in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _resolve_default_base_dir() -> Path:
    override = os.getenv("NEUROWRATH_LOCAL_BASE_DIR")
    if override:
        return Path(override).expanduser().resolve()
    return (Path(__file__).resolve().parents[2] / "neurowraith").resolve()


class LocalNeuroWraithRunner:
    """Execute NeuroWraith spiders locally and return parsed listing items."""

    def __init__(
        self,
        *,
        base_dir: Path | None = None,
        scrapy_bin: str | None = None,
        python_bin: str | None = None,
    ) -> None:
        self.base_dir = (base_dir or _resolve_default_base_dir()).resolve()
        self.spiders_dir = (self.base_dir / "spiders").resolve()
        self.scrapy_bin = (
            scrapy_bin
            or os.getenv("NEUROWRATH_LOCAL_SCRAPY_BIN")
            or os.getenv("SCRAPY_BIN")
            or shutil.which("scrapy")
            or "scrapy"
        )
        self.python_bin = (
            python_bin
            or os.getenv("NEUROWRATH_LOCAL_PYTHON")
            or sys.executable
            or "python"
        )
        self._spider_config = self._load_spider_config()

    def is_available(self) -> bool:
        if not self._spider_config:
            return False

        requires_scrapy = any(
            str((config or {}).get("type") or "scrapy").strip().lower() != "script"
            for config in self._spider_config.values()
            if isinstance(config, dict)
        )
        if requires_scrapy and not self._command_exists(self.scrapy_bin):
            logger.warning(
                "Local NeuroWraith runner unavailable because scrapy executable "
                "was not found (scrapy_bin=%s)",
                self.scrapy_bin,
            )
            return False
        return True

    def fetch(
        self,
        *,
        spider: str,
        query: str | None = None,
        limit: int | None = None,
    ) -> list[dict]:
        spider_key = str(spider or "").strip().lower()
        if not spider_key:
            raise LocalNeuroWraithRunnerError("Spider name is required.")
        config = self._spider_config.get(spider_key)
        if not isinstance(config, dict):
            raise LocalNeuroWraithRunnerError(f"Unknown local spider '{spider_key}'.")

        supports_query = bool(config.get("supports_query", True))
        query_text = (query or "").strip()
        if query_text and not supports_query:
            raise LocalNeuroWraithRunnerError(
                f"Spider '{spider_key}' does not accept a query."
            )

        if spider_key == "bringatrailer" and not query_text:
            return self._run_bringatrailer_defaults(config, limit)

        return self._run_single(spider_key, config, query_text or None, limit)

    def _run_bringatrailer_defaults(
        self, config: dict[str, Any], limit: int | None
    ) -> list[dict]:
        merged: list[dict] = []
        seen_keys: set[tuple[str, str]] = set()
        for make_name in DEFAULT_BRINGATRAILER_MAKES:
            remaining = None
            if isinstance(limit, int):
                remaining = max(limit - len(merged), 0)
                if remaining <= 0:
                    break
            items = self._run_single("bringatrailer", config, make_name, remaining)
            for item in items:
                if not isinstance(item, dict):
                    continue
                vin = str(item.get("vin") or "").strip().upper()
                url = str(item.get("url") or item.get("source_url") or "").strip()
                key = (vin, url)
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                merged.append(item)
                if isinstance(limit, int) and len(merged) >= limit:
                    return merged
        return merged

    def _run_single(
        self,
        spider: str,
        config: dict[str, Any],
        query: str | None,
        limit: int | None,
    ) -> list[dict]:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", prefix=f"{spider}-", delete=False
        ) as handle:
            output_path = Path(handle.name).resolve()
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".log", prefix=f"{spider}-stdout-", delete=False
        ) as handle:
            stdout_path = Path(handle.name).resolve()
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".log", prefix=f"{spider}-stderr-", delete=False
        ) as handle:
            stderr_path = Path(handle.name).resolve()

        try:
            spider_type = str(config.get("type") or "scrapy").strip().lower()
            if spider_type == "script":
                command, cwd = self._build_script_command(
                    spider=spider,
                    config=config,
                    query=query,
                    limit=limit,
                    output_path=output_path,
                )
            else:
                command, cwd = self._build_scrapy_command(
                    spider=spider,
                    config=config,
                    query=query,
                    limit=limit,
                    output_path=output_path,
                )

            env = os.environ.copy()
            env.setdefault("PYTHONUNBUFFERED", "1")
            timeout_seconds = self._timeout_for(spider, limit)
            logger.info(
                "Running local NeuroWraith spider=%s cwd=%s timeout=%ss",
                spider,
                cwd,
                "none" if timeout_seconds is None else timeout_seconds,
            )
            with stdout_path.open("w", encoding="utf-8") as stdout_file, stderr_path.open(
                "w", encoding="utf-8"
            ) as stderr_file:
                proc = subprocess.run(
                    command,
                    cwd=str(cwd),
                    env=env,
                    text=True,
                    stdout=stdout_file,
                    stderr=stderr_file,
                    timeout=timeout_seconds,
                    check=False,
                )
            if proc.returncode != 0:
                tail = self._tail_logs(stdout_path, stderr_path, max_lines=40)
                raise LocalNeuroWraithRunnerError(
                    f"Local spider '{spider}' failed with exit code {proc.returncode}. "
                    f"Output tail:\n{tail}"
                )

            return self._load_output_items(output_path)
        except FileNotFoundError as exc:
            executable = command[0] if command else "<unknown>"
            raise LocalNeuroWraithRunnerError(
                f"Local spider '{spider}' could not start because executable "
                f"'{executable}' was not found."
            ) from exc
        except subprocess.TimeoutExpired as exc:
            tail = self._tail_logs(stdout_path, stderr_path, max_lines=40)
            detail = f" Output tail:\n{tail}" if tail else ""
            raise LocalNeuroWraithRunnerError(
                f"Local spider '{spider}' timed out after {exc.timeout}s.{detail}"
            ) from exc
        finally:
            try:
                output_path.unlink(missing_ok=True)
            except Exception:
                pass
            for log_path in (stdout_path, stderr_path):
                try:
                    log_path.unlink(missing_ok=True)
                except Exception:
                    pass

    def _build_scrapy_command(
        self,
        *,
        spider: str,
        config: dict[str, Any],
        query: str | None,
        limit: int | None,
        output_path: Path,
    ) -> tuple[list[str], Path]:
        directory = str(config.get("directory") or spider).strip() or spider
        project_dir = (self.spiders_dir / directory).resolve()
        if not self._is_within(project_dir, self.spiders_dir):
            raise LocalNeuroWraithRunnerError(
                f"Invalid project path for spider '{spider}'."
            )
        cfg_path = project_dir / "scrapy.cfg"
        if not cfg_path.exists():
            raise LocalNeuroWraithRunnerError(
                f"Missing scrapy.cfg for spider '{spider}'."
            )

        command = [self.scrapy_bin, "crawl", spider, "-O", str(output_path)]
        if query:
            command.extend(["-a", f"q={query}"])
        supports_max_cars = bool(config.get("supports_max_cars", True))
        if isinstance(limit, int) and limit > 0 and supports_max_cars:
            command.extend(["-s", f"CLOSESPIDER_ITEMCOUNT={limit}"])
        return command, project_dir

    def _build_script_command(
        self,
        *,
        spider: str,
        config: dict[str, Any],
        query: str | None,
        limit: int | None,
        output_path: Path,
    ) -> tuple[list[str], Path]:
        command_template = config.get("command")
        if not isinstance(command_template, list) or not command_template:
            raise LocalNeuroWraithRunnerError(
                f"No script command configured for spider '{spider}'."
            )

        replacements: dict[str, str] = {
            "{python}": self.python_bin,
            "{output}": str(output_path),
        }
        if query:
            replacements["{query}"] = query
        if isinstance(limit, int) and limit > 0:
            replacements["{limit}"] = str(limit)

        command: list[str] = []
        for raw in command_template:
            tokenized = str(raw)
            if "{query}" in tokenized and not query:
                continue
            if "{limit}" in tokenized and not isinstance(limit, int):
                continue
            for token, value in replacements.items():
                if token in tokenized:
                    tokenized = tokenized.replace(token, value)
            command.append(tokenized)

        joined = " ".join(command)
        if "{output}" not in joined and str(output_path) not in command:
            command.extend(["--output", str(output_path)])
        supports_max_cars = bool(config.get("supports_max_cars", True))
        if (
            isinstance(limit, int)
            and limit > 0
            and "{limit}" not in joined
            and supports_max_cars
        ):
            command.extend(["--max-items", str(limit)])

        cwd_raw = (
            str(config.get("cwd") or "").strip()
            or str(config.get("directory") or "").strip()
            or "."
        )
        cwd = (self.base_dir / cwd_raw).resolve()
        if not self._is_within(cwd, self.base_dir):
            raise LocalNeuroWraithRunnerError(
                f"Invalid script working directory for spider '{spider}'."
            )
        if not cwd.exists():
            raise LocalNeuroWraithRunnerError(
                f"Script working directory does not exist for spider '{spider}'."
            )
        return command, cwd

    def _timeout_for(self, spider: str, limit: int | None) -> int | None:
        if limit is None:
            return None
        if spider == "carsandbids":
            return 5400
        base = 900
        if isinstance(limit, int) and limit > 0:
            base = max(base, min(3600, 120 + (limit * 8)))
        if _bool_from_env("NEUROWRATH_LOCAL_LONG_TIMEOUT", False):
            base = max(base, 5400)
        return base

    @staticmethod
    def _tail_logs(*paths: Path, max_lines: int = 40) -> str:
        combined: deque[str] = deque(maxlen=max(1, int(max_lines)))
        for path in paths:
            try:
                with path.open("r", encoding="utf-8", errors="replace") as handle:
                    for line in handle:
                        stripped = line.rstrip()
                        if stripped:
                            combined.append(stripped)
            except Exception:
                continue
        return "\n".join(combined)

    def _load_output_items(self, output_path: Path) -> list[dict]:
        if not output_path.exists():
            return []
        text = output_path.read_text(encoding="utf-8").strip()
        if not text:
            return []
        try:
            payload = json.loads(text)
        except ValueError as exc:
            raise LocalNeuroWraithRunnerError(
                "Local spider output was not valid JSON."
            ) from exc
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if isinstance(payload, dict):
            result = payload.get("result")
            if isinstance(result, list):
                return [item for item in result if isinstance(item, dict)]
        return []

    def _load_spider_config(self) -> dict[str, dict[str, Any]]:
        config_path = self.spiders_dir / "spider_config.json"
        if not config_path.exists():
            raise LocalNeuroWraithRunnerError(
                f"NeuroWraith spider config not found: {config_path}"
            )
        try:
            parsed = json.loads(config_path.read_text(encoding="utf-8") or "{}")
        except ValueError as exc:
            raise LocalNeuroWraithRunnerError(
                f"Failed to parse spider config: {config_path}"
            ) from exc
        if not isinstance(parsed, dict):
            raise LocalNeuroWraithRunnerError("Spider config must be a JSON object.")
        normalized: dict[str, dict[str, Any]] = {}
        for raw_name, raw_info in parsed.items():
            slug = str(raw_name or "").strip().lower()
            if not slug:
                continue
            info = raw_info if isinstance(raw_info, dict) else {}
            normalized[slug] = info
        return normalized

    @staticmethod
    def _is_within(path: Path, base_dir: Path) -> bool:
        try:
            path.relative_to(base_dir)
            return True
        except ValueError:
            return False

    @staticmethod
    def _command_exists(command: str | None) -> bool:
        candidate = str(command or "").strip()
        if not candidate:
            return False
        if any(sep in candidate for sep in ("/", "\\")):
            return Path(candidate).expanduser().exists()
        return shutil.which(candidate) is not None
