from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, func, select

from playground.api.deps import not_found
from playground.api.serialize import prompt_payload
from playground.db import run_db
from playground.models import Prompt, PromptVersion

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


class PromptCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    notes: str = ""
    system_text: str = ""
    user_text: str = Field(min_length=1)
    output_language: str = "fr"


class PromptPatch(BaseModel):
    name: str | None = None
    notes: str | None = None


class VersionCreate(BaseModel):
    system_text: str = ""
    user_text: str = Field(min_length=1)
    output_language: str = "fr"


@router.get("")
async def list_prompts():
    return await run_db(
        lambda s: [prompt_payload(s, p) for p in s.exec(select(Prompt).order_by(Prompt.id)).all()]
    )


@router.post("", status_code=201)
async def create_prompt(body: PromptCreate):
    def _q(session: Session):
        p = Prompt(name=body.name.strip(), notes=body.notes)
        session.add(p)
        session.commit()
        session.refresh(p)
        session.add(
            PromptVersion(
                prompt_id=p.id,
                version=1,
                system_text=body.system_text,
                user_text=body.user_text,
                output_language=body.output_language,
            )
        )
        session.commit()
        return prompt_payload(session, p)

    return await run_db(_q)


@router.patch("/{prompt_id}")
async def patch_prompt(prompt_id: int, body: PromptPatch):
    def _q(session: Session):
        p = session.get(Prompt, prompt_id)
        if p is None:
            raise not_found("prompt", prompt_id)
        if body.name is not None:
            if not body.name.strip():
                raise HTTPException(422, "name cannot be empty")
            p.name = body.name.strip()
        if body.notes is not None:
            p.notes = body.notes
        session.add(p)
        session.commit()
        return prompt_payload(session, p)

    return await run_db(_q)


@router.post("/{prompt_id}/versions", status_code=201)
async def create_version(prompt_id: int, body: VersionCreate):
    def _q(session: Session):
        p = session.get(Prompt, prompt_id)
        if p is None:
            raise not_found("prompt", prompt_id)
        latest = (
            session.exec(
                select(func.max(PromptVersion.version)).where(PromptVersion.prompt_id == prompt_id)
            ).one()
            or 0
        )
        session.add(
            PromptVersion(
                prompt_id=prompt_id,
                version=int(latest) + 1,
                system_text=body.system_text,
                user_text=body.user_text,
                output_language=body.output_language,
            )
        )
        session.commit()
        return prompt_payload(session, p)

    return await run_db(_q)
