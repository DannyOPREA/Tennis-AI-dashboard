from __future__ import annotations

from fastapi import HTTPException


def not_found(what: str, ident) -> HTTPException:
    return HTTPException(status_code=404, detail=f"{what} {ident} not found")
