from datetime import datetime
from typing import Annotated, Literal, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import text

from tcpmon.config import get_settings
from tcpmon.db import engine
from tcpmon.monitor import CompletedProbe, ProbeBusy, run_probe
from tcpmon.normalize import Kind, parse_address
from tcpmon.probes import probe_endpoint
from tcpmon.schemas import (
    AddressBody,
    AddressPreview,
    CheckPage,
    MetaResponse,
    ProbePreview,
    ProbeRequest,
    ProbeRun,
    SeriesResponse,
    TargetListResponse,
    TargetOut,
    TargetUpdate,
    TargetWrite,
)
from tcpmon.store import (
    TargetNotFound,
    delete_target,
    get_target,
    insert_target,
    list_checks,
    list_summaries,
    series,
    update_target,
)
from tcpmon.window import resolve_window

router = APIRouter(prefix="/api")


def window_from_query(
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
) -> tuple[datetime, datetime]:
    return resolve_window(start, end)


Window = Annotated[tuple[datetime, datetime], Depends(window_from_query)]


@router.get("/health")
async def health() -> dict[str, str]:
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="database unavailable") from exc
    return {"status": "ok"}


@router.get("/meta", response_model=MetaResponse)
async def meta() -> MetaResponse:
    return MetaResponse(retention_days=get_settings().retention_days)


@router.post("/address", response_model=AddressPreview)
async def preview_address(body: AddressBody) -> AddressPreview:
    endpoint = parse_address(body.address)
    return AddressPreview(
        kind=endpoint.kind,
        endpoint=endpoint.display,
        host=endpoint.host,
        port=endpoint.port,
        path=endpoint.path,
    )


@router.post("/probe", response_model=ProbePreview)
async def preview_probe(body: ProbeRequest) -> ProbePreview:
    endpoint = parse_address(body.address)
    result = await probe_endpoint(endpoint, body.timeout_ms)
    return ProbePreview(
        ok=result.ok,
        latency_ms=result.latency_ms,
        status_code=result.status_code,
        error=result.error,
        endpoint=endpoint.display,
        kind=endpoint.kind,
    )


@router.get("/targets", response_model=TargetListResponse)
async def read_targets(window: Window) -> TargetListResponse:
    start, end = window
    return TargetListResponse(
        start=start,
        end=end,
        retention_days=get_settings().retention_days,
        targets=await list_summaries(start, end),
    )


@router.post("/targets", response_model=TargetOut, status_code=201)
async def create_target(body: TargetWrite) -> TargetOut:
    target = await insert_target(body)
    if target.enabled:
        await _probe_quietly(target.id, include_disabled=False)
        target = await get_target(target.id)
    return target


@router.get("/targets/{target_id}", response_model=TargetOut)
async def read_target(target_id: UUID) -> TargetOut:
    return await get_target(target_id)


@router.patch("/targets/{target_id}", response_model=TargetOut)
async def patch_target(target_id: UUID, body: TargetUpdate) -> TargetOut:
    target = await update_target(target_id, body)
    if target.enabled and ({"address", "timeout_ms"} & body.model_fields_set):
        await _probe_quietly(target.id, include_disabled=False)
        target = await get_target(target.id)
    return target


@router.delete("/targets/{target_id}", status_code=204)
async def remove_target(target_id: UUID) -> Response:
    await delete_target(target_id)
    return Response(status_code=204)


@router.post("/targets/{target_id}/probe", response_model=ProbeRun)
async def probe_target(target_id: UUID) -> ProbeRun:
    completed = await run_probe(
        target_id,
        include_disabled=True,
        raise_if_busy=True,
        raise_if_missing=True,
    )
    if completed is None:
        raise TargetNotFound()
    return _probe_run(completed)


@router.get("/targets/{target_id}/series", response_model=SeriesResponse)
async def read_series(target_id: UUID, window: Window) -> SeriesResponse:
    start, end = window
    return await series(target_id, start, end)


@router.get("/targets/{target_id}/checks", response_model=CheckPage)
async def read_checks(
    target_id: UUID,
    window: Window,
    status: Annotated[Literal["all", "up", "down"], Query()] = "all",
    q: Annotated[str, Query(max_length=200)] = "",
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CheckPage:
    start, end = window
    return await list_checks(
        target_id,
        start,
        end,
        status=status,
        query=q.strip(),
        limit=limit,
        offset=offset,
    )


async def _probe_quietly(target_id: UUID, *, include_disabled: bool) -> None:
    try:
        await run_probe(
            target_id,
            include_disabled=include_disabled,
            raise_if_busy=True,
            raise_if_missing=True,
        )
    except (ProbeBusy, TargetNotFound):
        return


def _probe_run(completed: CompletedProbe) -> ProbeRun:
    return ProbeRun(
        ok=completed.ok,
        latency_ms=completed.latency_ms,
        status_code=completed.status_code,
        error=completed.error,
        endpoint=completed.endpoint,
        kind=cast(Kind, completed.kind),
        checked_at=completed.checked_at,
    )
