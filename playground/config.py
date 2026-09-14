"""Application settings loaded from environment variables and `.env`."""

from __future__ import annotations

import socket
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    gemini_api_key: str = ""
    ollama_url: str = ""
    data_dir: Path = Field(default=PROJECT_ROOT / "data")
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
        return PROJECT_ROOT / "playground" / "registry" / "models.yaml"

    @property
    def prompts_seed_path(self) -> Path:
        return PROJECT_ROOT / "playground" / "prompts" / "seed.yaml"

    @property
    def frontend_dist(self) -> Path:
        return PROJECT_ROOT / "frontend" / "dist"

    def ensure_dirs(self) -> None:
        for d in (self.data_dir, self.videos_dir, self.frames_dir, self.logs_dir):
            d.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    if not (PROJECT_ROOT / ".env").exists():
        return Settings(_env_file=None)  # type: ignore[call-arg]
    return Settings()
