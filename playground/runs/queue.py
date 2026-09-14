"""Two-lane in-process queue: GPU lane (sequential) and API lane (bounded concurrency)."""

from __future__ import annotations

import asyncio
import contextlib
import logging

from playground.config import get_settings
from playground.providers.registry import is_local
from playground.runs.progress import store
from playground.runs.service import execute_run

log = logging.getLogger("playground.queue")


class RunQueue:
    def __init__(self) -> None:
        self._gpu: asyncio.Queue[int] = asyncio.Queue()
        self._gpu_worker: asyncio.Task | None = None
        self._api_sem: asyncio.Semaphore | None = None
        self._tasks: dict[int, asyncio.Task] = {}
        self._pending_gpu: set[int] = set()

    async def start(self) -> None:
        self._api_sem = asyncio.Semaphore(get_settings().api_lane_concurrency)
        self._gpu_worker = asyncio.create_task(self._gpu_loop(), name="gpu-lane")

    async def stop(self) -> None:
        if self._gpu_worker:
            self._gpu_worker.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._gpu_worker
        for t in list(self._tasks.values()):
            t.cancel()

    def submit(self, run_id: int, provider: str, batch_id: int | None = None) -> None:
        store.ensure(run_id, "queued")
        store.set_status(run_id, "queued", None, "", batch_id=batch_id)
        if is_local(provider):
            self._pending_gpu.add(run_id)
            self._gpu.put_nowait(run_id)
        else:
            self._tasks[run_id] = asyncio.create_task(
                self._run_api(run_id), name=f"api-run-{run_id}"
            )

    def cancel(self, run_id: int) -> bool:
        rp = store.get(run_id)
        if rp is None:
            return False
        rp.cancel.set()
        return True

    async def _run_api(self, run_id: int) -> None:
        assert self._api_sem is not None
        try:
            async with self._api_sem:
                if await self._skip_if_cancelled(run_id):
                    return
                await execute_run(run_id)
        except Exception:  # noqa: BLE001
            log.exception("api lane crashed for run %s", run_id)
        finally:
            self._tasks.pop(run_id, None)

    async def _gpu_loop(self) -> None:
        while True:
            run_id = await self._gpu.get()
            self._pending_gpu.discard(run_id)
            try:
                if await self._skip_if_cancelled(run_id):
                    continue
                await execute_run(run_id)
            except Exception:  # noqa: BLE001
                log.exception("gpu lane crashed for run %s", run_id)
            finally:
                self._gpu.task_done()

    async def _skip_if_cancelled(self, run_id: int) -> bool:
        rp = store.get(run_id)
        if rp is not None and rp.cancel.is_set():
            from playground.runs.service import _update

            await _update(run_id, status="cancelled", stage=None)
            store.set_status(run_id, "cancelled")
            return True
        return False

    @property
    def gpu_backlog(self) -> int:
        return self._gpu.qsize()


queue = RunQueue()
