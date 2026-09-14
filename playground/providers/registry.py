"""Map provider names to implementations."""

from __future__ import annotations

from playground.providers.base import Provider
from playground.providers.gemini import GeminiProvider
from playground.providers.mock import MockProvider
from playground.providers.ollama import OllamaProvider
from playground.providers.openai_compat import OpenAICompatProvider

_PROVIDERS: dict[str, Provider] = {
    "gemini": GeminiProvider(),
    "ollama": OllamaProvider(),
    "openai_compat": OpenAICompatProvider(),
    "mock": MockProvider(),
}

API_PROVIDERS = {"gemini"}  # everything else is assumed to use the local GPU


def get_provider(name: str) -> Provider:
    try:
        return _PROVIDERS[name]
    except KeyError as e:
        raise KeyError(f"unknown provider '{name}'") from e


def is_local(provider: str) -> bool:
    return provider not in API_PROVIDERS
