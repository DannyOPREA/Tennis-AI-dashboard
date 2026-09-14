"""Background Ollama model downloads started from the UI, with polled progress."""

from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime

import httpx


def _now() -> str:
    return datetime.now(UTC).isoformat()


@dataclass
class PullJob:
    model_config_id: str
    tag: str
    status: str = "pulling"
    completed_bytes: int = 0
    total_bytes: int | None = None
    percent: float | None = None
    message: str = "Starting"
    started_at: str = field(default_factory=_now)
    finished_at: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


class PullManager:
    def __init__(self) -> None:
        self.jobs: dict[str, PullJob] = {}
        self._tasks: dict[str, asyncio.Task] = {}

    def is_pulling(self, model_config_id: str) -> bool:
        j = self.jobs.get(model_config_id)
        return j is not None and j.status == "pulling"

    def start(self, model_config_id: str, tag: str, base_url: str) -> PullJob:
        if self.is_pulling(model_config_id):
            return self.jobs[model_config_id]
        job = PullJob(model_config_id=model_config_id, tag=tag)
        self.jobs[model_config_id] = job
        self._tasks[model_config_id] = asyncio.create_task(self._run(job, base_url))
        return job

    def cancel(self, model_config_id: str) -> bool:
        t = self._tasks.get(model_config_id)
        if t is None or t.done():
            return False
        t.cancel()
        return True

    async def _run(self, job: PullJob, base_url: str) -> None:
        # Ollama reports per-layer totals; the weights layer dominates, so track the largest layer
        # seen for the percentage and sum nothing across layers (that would double count).
        largest_total = 0
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30, read=None)) as client:
                async with client.stream(
                    "POST",
                    f"{base_url.rstrip('/')}/api/pull",
                    json={"model": job.tag, "stream": True},
                ) as resp:
                    if resp.status_code >= 400:
                        body = (await resp.aread()).decode(errors="replace")[:300]
                        raise RuntimeError(f"Ollama {resp.status_code}: {body}")
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        obj = json.loads(line)
                        if obj.get("error"):
                            raise RuntimeError(str(obj["error"]))
                        status = obj.get("status") or ""
                        total = int(obj.get("total") or 0)
                        completed = int(obj.get("completed") or 0)
                        if total >= largest_total and total > 0:
                            largest_total = total
                            job.total_bytes = total
                            job.completed_bytes = completed
                            job.percent = round(completed / total * 100, 1)
                        job.message = status
                        if status == "success":
                            job.percent = 100.0
                            if job.total_bytes:
                                job.completed_bytes = job.total_bytes
            job.status, job.message = "done", "Downloaded"
        except asyncio.CancelledError:
            job.status, job.message = "cancelled", "Cancelled"
            raise
        except Exception as e:  # noqa: BLE001 - reported on the job
            job.status, job.message = "error", f"{type(e).__name__}: {e}"[:300]
        finally:
            job.finished_at = _now()
            self._tasks.pop(job.model_config_id, None)


pulls = PullManager()
