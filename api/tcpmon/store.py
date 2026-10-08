"""Persistence for targets and latency history."""

from collections.abc import Mapping
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import delete, select, text

from tcpmon.config import get_settings
from tcpmon.db import SessionLocal
from tcpmon.models import Check, Target
from tcpmon.normalize import parse_address
from tcpmon.probes import ProbeResult, ProbeSpec
from tcpmon.schemas import (
    CheckOut,
    CheckPage,
    SeriesPoint,
    SeriesResponse,
    TargetOut,
    TargetSummary,
    TargetUpdate,
    TargetWrite,
    WindowStats,
)
from tcpmon.window import choose_bucket


class TargetNotFound(Exception):
    """No target exists with the requested id."""


def _num(value: object) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float, Decimal)):
        return round(float(value), 2)
    return None


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _stats(row: Mapping[str, Any] | None, p95: object) -> WindowStats:
    if row is None:
        return WindowStats(p95_ms=_num(p95))
    samples = int(row["samples"] or 0)
    ok_count = int(row["ok_count"] or 0)
    uptime = round(ok_count / samples * 100, 2) if samples else None
    return WindowStats(
        samples=samples,
        ok_count=ok_count,
        uptime=uptime,
        min_ms=_num(row.get("min_ms")),
        avg_ms=_num(row.get("avg_ms")),
        p95_ms=_num(p95),
        max_ms=_num(row.get("max_ms")),
    )


def _sort_key(target: TargetSummary) -> tuple[int, str]:
    if target.last_ok is False:
        rank = 0
    elif target.last_ok is None:
        rank = 1
    elif not target.enabled:
        rank = 2
    else:
        rank = 3
    return (rank, target.name.lower())


async def insert_target(body: TargetWrite) -> TargetOut:
    endpoint = parse_address(body.address)
    now = datetime.now(timezone.utc)
    target = Target(
        id=uuid4(),
        name=body.name,
        kind=endpoint.kind,
        host=endpoint.host,
        port=endpoint.port,
        path="" if endpoint.kind == "tcp" else endpoint.path,
        interval_seconds=body.interval_seconds,
        timeout_ms=body.timeout_ms,
        enabled=body.enabled,
        next_check_at=now + timedelta(seconds=body.interval_seconds),
        created_at=now,
        updated_at=now,
    )
    async with SessionLocal() as session:
        session.add(target)
        await session.commit()
        return TargetOut.model_validate(target)


async def update_target(target_id: UUID, patch: TargetUpdate) -> TargetOut:
    async with SessionLocal() as session:
        target = await session.get(Target, target_id)
        if target is None:
            raise TargetNotFound()
        now = datetime.now(timezone.utc)
        fields = patch.model_fields_set
        probe_changed = False
        if "name" in fields and patch.name is not None:
            target.name = patch.name
        if "address" in fields and patch.address is not None:
            endpoint = parse_address(patch.address)
            target.kind = endpoint.kind
            target.host = endpoint.host
            target.port = endpoint.port
            target.path = "" if endpoint.kind == "tcp" else endpoint.path
            probe_changed = True
        if "interval_seconds" in fields and patch.interval_seconds is not None:
            target.interval_seconds = patch.interval_seconds
            probe_changed = True
        if "timeout_ms" in fields and patch.timeout_ms is not None:
            target.timeout_ms = patch.timeout_ms
            probe_changed = True
        enabling = False
        if "enabled" in fields and patch.enabled is not None:
            enabling = bool(patch.enabled) and not target.enabled
            target.enabled = patch.enabled
        if target.enabled and (enabling or probe_changed):
            target.next_check_at = now
        target.updated_at = now
        await session.commit()
        return TargetOut.model_validate(target)


async def delete_target(target_id: UUID) -> None:
    async with SessionLocal() as session:
        if await session.get(Target, target_id) is None:
            raise TargetNotFound()
        await session.execute(delete(Target).where(Target.id == target_id))
        await session.commit()


async def get_target(target_id: UUID) -> TargetOut:
    async with SessionLocal() as session:
        target = await session.get(Target, target_id)
        if target is None:
            raise TargetNotFound()
        return TargetOut.model_validate(target)


async def get_probe_spec(target_id: UUID, *, include_disabled: bool) -> ProbeSpec | None:
    async with SessionLocal() as session:
        target = await session.get(Target, target_id)
        if target is None or (not target.enabled and not include_disabled):
            return None
        return ProbeSpec(
            kind=target.kind,
            host=target.host,
            port=target.port,
            path=target.path,
            timeout_ms=target.timeout_ms,
        )


async def save_check(target_id: UUID, result: ProbeResult) -> datetime | None:
    now = datetime.now(timezone.utc)
    error = result.error[:500] if result.error else None
    async with SessionLocal() as session:
        target = await session.get(Target, target_id)
        if target is None:
            return None
        session.add(
            Check(
                target_id=target_id,
                checked_at=now,
                ok=result.ok,
                latency_ms=result.latency_ms,
                status_code=result.status_code,
                error=error,
            )
        )
        target.last_checked_at = now
        target.last_ok = result.ok
        target.last_latency_ms = result.latency_ms
        target.last_status_code = result.status_code
        target.last_error = error
        target.next_check_at = now + timedelta(seconds=target.interval_seconds)
        target.updated_at = now
        await session.commit()
        return now


async def due_target_ids(limit: int = 100) -> list[UUID]:
    now = datetime.now(timezone.utc)
    async with SessionLocal() as session:
        rows = await session.scalars(
            select(Target.id)
            .where(Target.enabled.is_(True), Target.next_check_at <= now)
            .order_by(Target.next_check_at)
            .limit(limit)
        )
        return list(rows)


async def list_summaries(start: datetime, end: datetime) -> list[TargetSummary]:
    bucket = choose_bucket((end - start).total_seconds(), 32)
    params = {"start": start, "end": end, "bucket": bucket}
    async with SessionLocal() as session:
        targets = list(await session.scalars(select(Target)))
        stats_rows = (
            await session.execute(
                text(
                    """
                    SELECT
                        target_id,
                        CAST(count(*) AS int) AS samples,
                        CAST(count(*) FILTER (WHERE ok) AS int) AS ok_count,
                        min(latency_ms) FILTER (WHERE ok) AS min_ms,
                        avg(latency_ms) FILTER (WHERE ok) AS avg_ms,
                        max(latency_ms) FILTER (WHERE ok) AS max_ms
                    FROM checks
                    WHERE checked_at >= :start AND checked_at < :end
                    GROUP BY target_id
                    """
                ),
                params,
            )
        ).mappings().all()
        p95_rows = (
            await session.execute(
                text(
                    """
                    SELECT
                        target_id,
                        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms
                    FROM checks
                    WHERE checked_at >= :start
                      AND checked_at < :end
                      AND ok
                      AND latency_ms IS NOT NULL
                    GROUP BY target_id
                    """
                ),
                params,
            )
        ).mappings().all()
        spark_rows = (
            await session.execute(
                text(
                    """
                    SELECT
                        target_id,
                        CAST(floor(extract(epoch FROM checked_at) / :bucket) AS bigint)
                            AS bucket_index,
                        avg(latency_ms) FILTER (WHERE ok) AS avg_ms
                    FROM checks
                    WHERE checked_at >= :start AND checked_at < :end
                    GROUP BY target_id, bucket_index
                    """
                ),
                params,
            )
        ).mappings().all()
        summaries = _assemble_summaries(
            targets,
            stats_rows,
            p95_rows,
            spark_rows,
            start,
            end,
            bucket,
        )
    summaries.sort(key=_sort_key)
    return summaries


def _assemble_summaries(
    targets: list[Target],
    stats_rows: list[Mapping[str, Any]],
    p95_rows: list[Mapping[str, Any]],
    spark_rows: list[Mapping[str, Any]],
    start: datetime,
    end: datetime,
    bucket: int,
) -> list[TargetSummary]:
    stats_by_id = {row["target_id"]: row for row in stats_rows}
    p95_by_id = {row["target_id"]: row["p95_ms"] for row in p95_rows}
    start_index = int(start.timestamp() // bucket)
    end_index = int((end.timestamp() - 0.001) // bucket)
    length = max(1, min(120, end_index - start_index + 1))
    sparks: dict[UUID, list[float | None]] = {
        target.id: [None] * length for target in targets
    }
    for row in spark_rows:
        values = sparks.get(row["target_id"])
        if values is None:
            continue
        index = int(row["bucket_index"]) - start_index
        if 0 <= index < len(values):
            values[index] = _num(row["avg_ms"])
    summaries: list[TargetSummary] = []
    for target in targets:
        summary = TargetSummary.model_validate(target).model_copy(
            update={
                "stats": _stats(stats_by_id.get(target.id), p95_by_id.get(target.id)),
                "spark": sparks[target.id],
            }
        )
        summaries.append(summary)
    return summaries


async def series(target_id: UUID, start: datetime, end: datetime) -> SeriesResponse:
    bucket = choose_bucket((end - start).total_seconds(), 160)
    params = {
        "target_id": target_id,
        "start": start,
        "end": end,
        "bucket": bucket,
    }
    async with SessionLocal() as session:
        if await session.get(Target, target_id) is None:
            raise TargetNotFound()
        stats_row = (
            await session.execute(
                text(
                    """
                    SELECT
                        CAST(count(*) AS int) AS samples,
                        CAST(count(*) FILTER (WHERE ok) AS int) AS ok_count,
                        min(latency_ms) FILTER (WHERE ok) AS min_ms,
                        avg(latency_ms) FILTER (WHERE ok) AS avg_ms,
                        max(latency_ms) FILTER (WHERE ok) AS max_ms
                    FROM checks
                    WHERE target_id = :target_id
                      AND checked_at >= :start
                      AND checked_at < :end
                    """
                ),
                params,
            )
        ).mappings().one()
        p95_row = (
            await session.execute(
                text(
                    """
                    SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms
                    FROM checks
                    WHERE target_id = :target_id
                      AND checked_at >= :start
                      AND checked_at < :end
                      AND ok
                      AND latency_ms IS NOT NULL
                    """
                ),
                params,
            )
        ).mappings().one()
        point_rows = (
            await session.execute(
                text(
                    """
                    SELECT
                        to_timestamp(
                            CAST(
                                floor(extract(epoch FROM checked_at) / :bucket) * :bucket
                                AS double precision
                            )
                        ) AS t,
                        avg(latency_ms) FILTER (WHERE ok) AS avg_ms,
                        min(latency_ms) FILTER (WHERE ok) AS min_ms,
                        max(latency_ms) FILTER (WHERE ok) AS max_ms,
                        CAST(count(*) AS int) AS samples,
                        CAST(count(*) FILTER (WHERE NOT ok) AS int) AS failures
                    FROM checks
                    WHERE target_id = :target_id
                      AND checked_at >= :start
                      AND checked_at < :end
                    GROUP BY 1
                    ORDER BY 1
                    """
                ),
                params,
            )
        ).mappings().all()
    points = [
        SeriesPoint(
            t=_as_utc(row["t"]),
            avg_ms=_num(row["avg_ms"]),
            min_ms=_num(row["min_ms"]),
            max_ms=_num(row["max_ms"]),
            samples=int(row["samples"] or 0),
            failures=int(row["failures"] or 0),
        )
        for row in point_rows
    ]
    return SeriesResponse(
        start=start,
        end=end,
        bucket_seconds=bucket,
        stats=_stats(stats_row, p95_row["p95_ms"]),
        points=points,
    )


async def list_checks(
    target_id: UUID,
    start: datetime,
    end: datetime,
    *,
    status: str,
    query: str,
    limit: int,
    offset: int,
) -> CheckPage:
    filters = [
        "target_id = :target_id",
        "checked_at >= :start",
        "checked_at < :end",
    ]
    if status == "up":
        filters.append("ok")
    elif status == "down":
        filters.append("NOT ok")
    params: dict[str, Any] = {
        "target_id": target_id,
        "start": start,
        "end": end,
        "limit": limit,
        "offset": offset,
    }
    if query:
        filters.append(
            "(coalesce(error, '') ILIKE :like ESCAPE '!' "
            "OR CAST(status_code AS text) ILIKE :like ESCAPE '!')"
        )
        params["like"] = _like_pattern(query)
    where = " AND ".join(filters)
    async with SessionLocal() as session:
        if await session.get(Target, target_id) is None:
            raise TargetNotFound()
        total = (
            await session.execute(
                text(f"SELECT CAST(count(*) AS int) AS total FROM checks WHERE {where}"),
                params,
            )
        ).scalar_one()
        rows = (
            await session.execute(
                text(
                    f"""
                    SELECT id, checked_at, ok, latency_ms, status_code, error
                    FROM checks
                    WHERE {where}
                    ORDER BY checked_at DESC, id DESC
                    LIMIT :limit OFFSET :offset
                    """
                ),
                params,
            )
        ).mappings().all()
    checks = [
        CheckOut(
            id=int(row["id"]),
            checked_at=_as_utc(row["checked_at"]),
            ok=bool(row["ok"]),
            latency_ms=_num(row["latency_ms"]),
            status_code=None if row["status_code"] is None else int(row["status_code"]),
            error=row["error"],
        )
        for row in rows
    ]
    return CheckPage(total=int(total or 0), limit=limit, offset=offset, checks=checks)


async def purge_expired(*, max_batches: int = 5) -> int:
    days = get_settings().retention_days
    if days <= 0:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    deleted = 0
    async with SessionLocal() as session:
        for _ in range(max_batches):
            result = await session.execute(
                text(
                    """
                    DELETE FROM checks
                    WHERE id IN (
                        SELECT id FROM checks
                        WHERE checked_at < :cutoff
                        LIMIT 5000
                    )
                    RETURNING id
                    """
                ),
                {"cutoff": cutoff},
            )
            batch = result.fetchall()
            await session.commit()
            deleted += len(batch)
            if len(batch) < 5000:
                break
    return deleted


def _like_pattern(value: str) -> str:
    escaped = value.replace("!", "!!").replace("%", "!%").replace("_", "!_")
    return f"%{escaped}%"
