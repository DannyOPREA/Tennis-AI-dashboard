"""Seed the prompt library from seed.yaml when the table is empty."""

from __future__ import annotations

import yaml
from sqlmodel import Session, select

from playground.config import get_settings
from playground.models import Prompt, PromptVersion


def seed_prompts(session: Session) -> int:
    if session.exec(select(Prompt)).first() is not None:
        return 0
    path = get_settings().prompts_seed_path
    if not path.exists():
        return 0
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    n = 0
    for item in data.get("prompts") or []:
        p = Prompt(name=item["name"], notes=item.get("notes", ""))
        session.add(p)
        session.commit()
        session.refresh(p)
        session.add(
            PromptVersion(
                prompt_id=p.id,
                version=1,
                system_text=item.get("system_text", "").strip(),
                user_text=item["user_text"].strip(),
                output_language=item.get("output_language", "fr"),
            )
        )
        n += 1
    session.commit()
    return n
