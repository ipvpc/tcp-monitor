"""Schedule probes and keep a single check in flight per target."""

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import datetime
from typing import cast
from uuid import UUID

from tcpmon.config import get_settings
from tcpmon.normalize import Endpoint, Kind
from tcpmon.probes import ProbeResult, friendly_error, probe_spec
from tcpmon.store import (
    TargetNotFound,
    due_target_ids,
    get_probe_spec,
    purge_expired,
    save_check,
)

logger = logging.getLogger("tcpmon.monitor")

_inflight: set[UUID] = set()
_guard = asyncio.Lock()
_semaphore: asyncio.Semaphore | None = None


class ProbeBusy(Exception):
    """This target already has a check running."""


@dataclass(frozen=True)
class CompletedProbe:
    ok: bool
    latency_ms: float | None
    status_code: int | None
    error: str | None
    checked_at: datetime
    endpoint: str
    kind: str


async def run_probe(
    target_id: UUID,
    *,
    include_disabled: bool = False,
    raise_if_busy: bool = False,
    raise_if_missing: bool = False,
) -> CompletedProbe | None:
    if not await _begin(target_id):
        if raise_if_busy:
            raise ProbeBusy()
        return None
    try:
        async with _probe_semaphore():
            return await _probe(
                target_id,
                include_disabled=include_disabled,
                raise_if_missing=raise_if_missing,
            )
    finally:
        await _end(target_id)


async def run_due() -> None:
    target_ids = await due_target_ids()
    if not target_ids:
        return
    results = await asyncio.gather(
        *(run_probe(target_id) for target_id in target_ids),
        return_exceptions=True,
    )
    for result in results:
        if isinstance(result, Exception):
            logger.error("probe task failed", exc_info=result)


async def scheduler_loop(stop: asyncio.Event) -> None:
    next_retention = time.monotonic() + 30
    while not stop.is_set():
        try:
            await run_due()
        except Exception:
            logger.exception("probe loop failed")
            await _wait(stop, 5)
            continue
        if time.monotonic() >= next_retention:
            try:
                removed = await purge_expired()
                if removed:
                    logger.info("removed %s expired checks", removed)
            except Exception:
                logger.exception("retention failed")
            next_retention = time.monotonic() + 300
        await _wait(stop, 1)


async def _probe(
    target_id: UUID,
    *,
    include_disabled: bool,
    raise_if_missing: bool,
) -> CompletedProbe | None:
    spec = await get_probe_spec(target_id, include_disabled=include_disabled)
    if spec is None:
        if raise_if_missing:
            raise TargetNotFound()
        return None
    try:
        result = await probe_spec(spec)
    except Exception as exc:
        logger.exception("probe failed for %s", target_id)
        result = ProbeResult(ok=False, latency_ms=None, error=friendly_error(exc))
    checked_at = await save_check(target_id, result)
    if checked_at is None:
        if raise_if_missing:
            raise TargetNotFound()
        return None
    if spec.kind not in ("tcp", "http", "https"):
        raise ValueError(f"unsupported kind {spec.kind}")
    endpoint = Endpoint(cast(Kind, spec.kind), spec.host, spec.port, spec.path)
    return CompletedProbe(
        ok=result.ok,
        latency_ms=result.latency_ms,
        status_code=result.status_code,
        error=result.error,
        checked_at=checked_at,
        endpoint=endpoint.display,
        kind=endpoint.kind,
    )


def _probe_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(max(1, get_settings().probe_concurrency))
    return _semaphore


async def _begin(target_id: UUID) -> bool:
    async with _guard:
        if target_id in _inflight:
            return False
        _inflight.add(target_id)
        return True


async def _end(target_id: UUID) -> None:
    async with _guard:
        _inflight.discard(target_id)


async def _wait(stop: asyncio.Event, seconds: float) -> None:
    try:
        await asyncio.wait_for(stop.wait(), timeout=seconds)
    except TimeoutError:
        return
