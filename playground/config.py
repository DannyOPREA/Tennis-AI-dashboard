"""Application settings.

Two layouts:
- Development: project root holds `.env`, `data/`, `frontend/dist`, `playground/registry`.
- Packaged (PyInstaller): read-only resources live next to the executable (`sys._MEIPASS`);
  the writable home is `%LOCALAPPDATA%\\TennisAI` on Windows (`~/.local/share/TennisAI`
  elsewhere) and holds `.env` and `data/`. `TENNISAI_HOME` overrides the home in both layouts.
"""

from __future__ import annotations

import os
import socket
import sys
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent
APP_VERSION = "0.2.0"


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def resources_root() -> Path:
    """Where read-only bundled files live (registry, prompts, frontend build, ffmpeg)."""
    if is_frozen():
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return PROJECT_ROOT


def app_home() -> Path:
    override = os.environ.get("TENNISAI_HOME")
    if override:
        return Path(override).expanduser()
    if not is_frozen():
        return PROJECT_ROOT
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / "TennisAI"


def env_file_path() -> Path:
    return app_home() / ".env"


def bundled_ffmpeg_dir() -> Path | None:
    d = resources_root() / "ffmpeg"
    return d if (d / ("ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")).exists() else None


def ensure_ffmpeg_on_path() -> None:
    d = bundled_ffmpeg_dir()
    if d and str(d) not in os.environ.get("PATH", ""):
        os.environ["PATH"] = str(d) + os.pathsep + os.environ.get("PATH", "")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file_encoding="utf-8", extra="ignore")

    gemini_api_key: str = ""
    ollama_url: str = ""
    data_dir: Path = Field(default_factory=lambda: app_home() / "data")
    host_name: str = ""
    energy_price_per_kwh: float = 0.25
    bind_host: str = "127.0.0.1"
    port: int = 8000
    api_lane_concurrency: int = 3
    run_timeout_s: int = 900
    max_upload_mb: int = 2048

    @property
    def host_label(self) -> str:
        return self.host_name or socket.gethostname()

    @property
    def videos_dir(self) -> Path:
        return self.data_dir / "videos"

    @property
    def frames_dir(self) -> Path:
        return self.data_dir / "frames"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "playground.db"

    @property
    def registry_path(self) -> Path:
        return resources_root() / "playground" / "registry" / "models.yaml"

    @property
    def prompts_seed_path(self) -> Path:
        return resources_root() / "playground" / "prompts" / "seed.yaml"

    @property
    def frontend_dist(self) -> Path:
        return resources_root() / "frontend" / "dist"

    @property
    def env_file(self) -> Path:
        return env_file_path()

    def ensure_dirs(self) -> None:
        for d in (app_home(), self.data_dir, self.videos_dir, self.frames_dir, self.logs_dir):
            d.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    ensure_ffmpeg_on_path()
    env = env_file_path()
    if env.exists():
        return Settings(_env_file=env)  # type: ignore[call-arg]
    return Settings(_env_file=None)  # type: ignore[call-arg]


ENV_KEYS = ("GEMINI_API_KEY", "OLLAMA_URL", "DATA_DIR", "HOST_NAME", "ENERGY_PRICE_PER_KWH")


def write_env(updates: dict[str, str]) -> Path:
    """Update keys in the env file in place (creating it), then reload settings."""
    path = env_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in updates:
                out.append(f"{key}={updates[key]}")
                seen.add(key)
                continue
        out.append(line)
    for key, value in updates.items():
        if key not in seen:
            out.append(f"{key}={value}")
    path.write_text("\n".join(out).rstrip("\n") + "\n", encoding="utf-8")
    for key in updates:
        os.environ.pop(key, None)  # the file must win over stale process env
    get_settings.cache_clear()
    return path
