"""SQLModel tables. See docs/api-contract.md for the JSON shapes served to the frontend."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Video(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str
    filename: str
    path_original: str
    path_playback: str
    path_thumbnail: str
    sha256: str = Field(index=True, unique=True)
    duration_s: float
    fps: float
    width: int
    height: int
    size_bytes: int
    has_audio: bool = False
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    gemini_file_uri: str | None = None
    gemini_file_name: str | None = None
    gemini_file_expires_at: datetime | None = None
    uploaded_at: datetime = Field(default_factory=utcnow)


class Prompt(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    notes: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class PromptVersion(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    prompt_id: int = Field(foreign_key="prompt.id", index=True)
    version: int
    system_text: str
    user_text: str
    output_language: str = "fr"
    created_at: datetime = Field(default_factory=utcnow)


class Batch(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = ""
    video_id: int = Field(foreign_key="video.id", index=True)
    prompt_version_id: int = Field(foreign_key="promptversion.id", index=True)
    frame_preset: str
    repeats: int = 1
    blind: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class Run(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    batch_id: int = Field(foreign_key="batch.id", index=True)
    repeat_index: int = 0
    video_id: int = Field(foreign_key="video.id", index=True)
    prompt_version_id: int = Field(foreign_key="promptversion.id", index=True)
    model_config_id: str = Field(index=True)
    model_label: str
    provider: str
    model_snapshot: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    input_mode: str
    frame_preset: str
    frame_plan: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    frame_plan_hash: str | None = None
    host: str
    status: str = Field(default="queued", index=True)
    stage: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    heartbeat_at: datetime | None = None
    output_text: str | None = None
    error: str | None = None
    retries: int = 0

    # timing split (ms)
    upload_ms: int | None = None
    extract_ms: int | None = None
    model_load_ms: int | None = None
    ttft_ms: int | None = None
    model_ms: int | None = None
    total_ms: int | None = None
    cold_start: bool = False
    cache_hit: bool = False

    # tokens
    tokens_in_total: int | None = None
    tokens_in_text: int | None = None
    tokens_in_image: int | None = None
    tokens_in_video: int | None = None
    tokens_in_audio: int | None = None
    tokens_in_cached: int | None = None
    tokens_out: int | None = None
    tokens_thinking: int | None = None
    truncated_suspected: bool = False

    # derived
    frames_sent: int | None = None
    video_seconds_sent: float | None = None
    output_chars: int | None = None
    output_words: int | None = None
    tokens_out_per_s: float | None = None

    # cost / gpu
    cost_api_usd: float | None = None
    gpu_seconds: float | None = None
    gpu_energy_wh: float | None = None
    cost_energy_usd: float | None = None
    gpu_peak_vram_delta_mb: int | None = None
    model_vram_mb: int | None = None

    # provenance
    model_version: str | None = None
    sdk_versions: dict[str, str] | None = Field(default=None, sa_column=Column(JSON))
    raw_usage: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    request_summary: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))


class Rating(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("run_id", "rater", name="uq_rating_run_rater"),)

    id: int | None = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="run.id", index=True)
    rater: str = "client"
    stars: int
    notes: str = ""
    blind: bool = False
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


METRIC_FIELDS = [
    "upload_ms",
    "extract_ms",
    "model_load_ms",
    "ttft_ms",
    "model_ms",
    "total_ms",
    "cold_start",
    "cache_hit",
    "tokens_in_total",
    "tokens_in_text",
    "tokens_in_image",
    "tokens_in_video",
    "tokens_in_audio",
    "tokens_in_cached",
    "tokens_out",
    "tokens_thinking",
    "truncated_suspected",
    "frames_sent",
    "video_seconds_sent",
    "output_chars",
    "output_words",
    "tokens_out_per_s",
    "cost_api_usd",
    "gpu_seconds",
    "gpu_energy_wh",
    "cost_energy_usd",
    "gpu_peak_vram_delta_mb",
    "model_vram_mb",
    "model_version",
    "sdk_versions",
]
