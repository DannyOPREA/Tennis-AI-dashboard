"""In-process NVIDIA sampler (nvidia-ml-py). No-op when no NVIDIA GPU or driver is present."""

from __future__ import annotations

import asyncio
import contextlib
import time
from dataclasses import dataclass


@dataclass
class GpuStats:
    gpu_seconds: float | None = None
    gpu_energy_wh: float | None = None
    peak_vram_delta_mb: int | None = None
    util_avg: float | None = None


def gpu_info() -> dict:
    try:
        import pynvml

        pynvml.nvmlInit()
        h = pynvml.nvmlDeviceGetHandleByIndex(0)
        name = pynvml.nvmlDeviceGetName(h)
        if isinstance(name, bytes):
            name = name.decode()
        mem = pynvml.nvmlDeviceGetMemoryInfo(h)
        pynvml.nvmlShutdown()
        return {"available": True, "name": name, "vram_total_mb": int(mem.total / (1024 * 1024))}
    except Exception:  # noqa: BLE001 - any NVML failure means "no GPU"
        return {"available": False, "name": None, "vram_total_mb": None}


class GpuSampler:
    def __init__(self, interval_s: float = 0.5):
        self.interval_s = interval_s
        self._task: asyncio.Task | None = None
        self._samples: list[tuple[float, int, float, float]] = []  # t, mem_used_mb, util, power_w
        self._handle = None
        self._nvml = None

    async def __aenter__(self) -> GpuSampler:
        try:
            import pynvml

            pynvml.nvmlInit()
            self._nvml = pynvml
            self._handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            self._task = asyncio.create_task(self._loop())
        except Exception:  # noqa: BLE001
            self._nvml = None
        return self

    async def __aexit__(self, *_exc) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        if self._nvml:
            with contextlib.suppress(Exception):
                self._nvml.nvmlShutdown()

    def _sample(self) -> None:
        nv, h = self._nvml, self._handle
        mem = nv.nvmlDeviceGetMemoryInfo(h)
        util = nv.nvmlDeviceGetUtilizationRates(h).gpu
        try:
            power = nv.nvmlDeviceGetPowerUsage(h) / 1000.0
        except Exception:  # noqa: BLE001
            power = 0.0
        self._samples.append(
            (time.perf_counter(), int(mem.used / (1024 * 1024)), float(util), float(power))
        )

    async def _loop(self) -> None:
        while True:
            with contextlib.suppress(Exception):
                self._sample()
            await asyncio.sleep(self.interval_s)

    def stats(self) -> GpuStats:
        if len(self._samples) < 2:
            return GpuStats()
        base_mem = self._samples[0][1]
        peak = max(s[1] for s in self._samples) - base_mem
        energy_wh = 0.0
        for (t0, _, _, p0), (t1, _, _, _) in zip(self._samples, self._samples[1:], strict=False):
            energy_wh += p0 * (t1 - t0) / 3600
        seconds = self._samples[-1][0] - self._samples[0][0]
        util = sum(s[2] for s in self._samples) / len(self._samples)
        return GpuStats(
            gpu_seconds=round(seconds, 2),
            gpu_energy_wh=round(energy_wh, 4),
            peak_vram_delta_mb=max(0, peak),
            util_avg=round(util, 1),
        )
