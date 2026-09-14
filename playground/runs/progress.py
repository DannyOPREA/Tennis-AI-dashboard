"""In-memory progress store and event bus (no DB writes per token)."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any


@dataclass
class RunProgress:
    run_id: int
    status: str = "queued"
    stage: str | None = None
    message: str = ""
    text: str = ""
    subscribers: list[asyncio.Queue] = field(default_factory=list)
    cancel: asyncio.Event = field(default_factory=asyncio.Event)
    final: dict[str, Any] | None = None


class ProgressStore:
    def __init__(self) -> None:
        self._runs: dict[int, RunProgress] = {}
        self._global: list[asyncio.Queue] = []

    def get(self, run_id: int) -> RunProgress | None:
        return self._runs.get(run_id)

    def ensure(self, run_id: int, status: str = "queued") -> RunProgress:
        rp = self._runs.get(run_id)
        if rp is None:
            rp = RunProgress(run_id=run_id, status=status)
            self._runs[run_id] = rp
        return rp

    def forget(self, run_id: int) -> None:
        self._runs.pop(run_id, None)

    def subscribe(self, run_id: int) -> tuple[RunProgress | None, asyncio.Queue]:
        q: asyncio.Queue = asyncio.Queue()
        rp = self._runs.get(run_id)
        if rp is not None:
            rp.subscribers.append(q)
        return rp, q

    def unsubscribe(self, run_id: int, q: asyncio.Queue) -> None:
        rp = self._runs.get(run_id)
        if rp and q in rp.subscribers:
            rp.subscribers.remove(q)

    def subscribe_global(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._global.append(q)
        return q

    def unsubscribe_global(self, q: asyncio.Queue) -> None:
        if q in self._global:
            self._global.remove(q)

    def _emit(self, rp: RunProgress, event: str, data: dict[str, Any]) -> None:
        for q in list(rp.subscribers):
            q.put_nowait((event, data))

    def set_status(
        self,
        run_id: int,
        status: str,
        stage: str | None = None,
        message: str = "",
        batch_id: int | None = None,
    ) -> None:
        rp = self.ensure(run_id)
        rp.status, rp.stage, rp.message = status, stage, message
        self._emit(rp, "status", {"status": status, "stage": stage, "message": message})
        for q in list(self._global):
            q.put_nowait(
                ("run", {"run_id": run_id, "batch_id": batch_id, "status": status, "stage": stage})
            )

    def append_text(self, run_id: int, text: str) -> None:
        rp = self.ensure(run_id)
        rp.text += text
        self._emit(rp, "delta", {"text": text})

    def finish(self, run_id: int, run_payload: dict[str, Any], error: str | None = None) -> None:
        rp = self.ensure(run_id)
        rp.final = run_payload
        if error:
            self._emit(rp, "error", {"message": error})
        self._emit(rp, "done", {"run": run_payload})
        for q in list(rp.subscribers):
            q.put_nowait(("__close__", {}))


store = ProgressStore()
