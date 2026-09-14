"""Load `models.yaml`: model catalogue and frame presets (single source of truth)."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any

import yaml

from playground.config import get_settings

_ENV_RE = re.compile(r"\$\{([A-Z0-9_]+)\}")


@dataclass
class FramePreset:
    key: str
    label: str
    description: str
    fps: float
    long_edge: int
    max_frames: int
    jpeg_quality: int = 85

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


@dataclass
class ModelConfig:
    id: str
    display_name: str
    provider: str
    model_id: str
    base_url: str | None
    input_modes: list[str]
    params: dict[str, Any]
    tokens_per_frame: int
    max_images: int | None
    prices: dict[str, Any]
    vram_note: str | None = None
    licence: str | None = None
    notes: str | None = None
    enabled: bool = True
    availability: dict[str, Any] = field(
        default_factory=lambda: {"available": True, "reason": None}
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "display_name": self.display_name,
            "provider": self.provider,
            "model_id": self.model_id,
            "base_url": self.base_url,
            "input_modes": list(self.input_modes),
            "params": dict(self.params),
            "tokens_per_frame": self.tokens_per_frame,
            "max_images": self.max_images,
            "prices": dict(self.prices),
            "vram_note": self.vram_note,
            "licence": self.licence,
            "notes": self.notes,
            "enabled": self.enabled,
            "availability": dict(self.availability),
        }


@dataclass
class Registry:
    models: dict[str, ModelConfig]
    presets: dict[str, FramePreset]

    def get_model(self, model_id: str) -> ModelConfig:
        try:
            return self.models[model_id]
        except KeyError as e:
            raise KeyError(f"unknown model '{model_id}'") from e

    def get_preset(self, key: str) -> FramePreset:
        try:
            return self.presets[key]
        except KeyError as e:
            raise KeyError(f"unknown frame preset '{key}'") from e


def _expand_env(value: str | None) -> str | None:
    if not value:
        return value
    settings = get_settings()
    env = {"OLLAMA_URL": settings.ollama_url or os.environ.get("OLLAMA_URL", "")}

    def repl(m: re.Match[str]) -> str:
        return env.get(m.group(1), os.environ.get(m.group(1), ""))

    return _ENV_RE.sub(repl, value)


DEFAULT_PRICES = {
    "text_in": 0,
    "image_in": 0,
    "video_in": 0,
    "audio_in": 0,
    "cached_in": 0,
    "out": 0,
}


def load_registry(path=None) -> Registry:
    from playground.providers.mock import mock_enabled

    path = path or get_settings().registry_path
    with open(path, encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}

    presets: dict[str, FramePreset] = {}
    for key, p in (raw.get("frame_presets") or {}).items():
        presets[key] = FramePreset(
            key=key,
            label=p.get("label", key),
            description=p.get("description", ""),
            fps=float(p["fps"]),
            long_edge=int(p["long_edge"]),
            max_frames=int(p["max_frames"]),
            jpeg_quality=int(p.get("jpeg_quality", 85)),
        )

    models: dict[str, ModelConfig] = {}
    for m in raw.get("models") or []:
        if m.get("provider") == "mock" and not mock_enabled():
            continue
        prices = {**DEFAULT_PRICES, **(m.get("prices") or {})}
        cfg = ModelConfig(
            id=str(m["id"]),
            display_name=m.get("display_name", m["id"]),
            provider=m["provider"],
            model_id=str(m["model_id"]),
            base_url=_expand_env(m.get("base_url")) or None,
            input_modes=list(m.get("input_modes") or ["frames"]),
            params=dict(m.get("params") or {}),
            tokens_per_frame=int(m.get("tokens_per_frame", 300)),
            max_images=m.get("max_images"),
            prices=prices,
            vram_note=m.get("vram_note"),
            licence=m.get("licence"),
            notes=m.get("notes"),
            enabled=bool(m.get("enabled", True)),
        )
        models[cfg.id] = cfg
    return Registry(models=models, presets=presets)


_registry: Registry | None = None


def get_registry() -> Registry:
    global _registry
    if _registry is None:
        _registry = load_registry()
    return _registry


def reload_registry() -> Registry:
    global _registry
    _registry = load_registry()
    return _registry
