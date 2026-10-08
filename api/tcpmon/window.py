"""Time-window rules shared by the history API."""

from datetime import datetime, timedelta, timezone

_NICE_BUCKETS = (
    1,
    2,
    5,
    10,
    15,
    30,
    60,
    120,
    300,
    600,
    900,
    1800,
    3600,
    7200,
    21600,
    43200,
    86400,
    604800,
)


class WindowError(ValueError):
    """The requested history window cannot be queried."""


def resolve_window(
    start: datetime | None,
    end: datetime | None,
    *,
    now: datetime | None = None,
) -> tuple[datetime, datetime]:
    """Return a UTC window, defaulting to the last hour."""

    current = now or datetime.now(timezone.utc)
    resolved_end = _aware(end or current)
    resolved_start = _aware(start or (resolved_end - timedelta(hours=1)))
    span = resolved_end - resolved_start
    if span <= timedelta(0):
        raise WindowError("The end of the window must be after the start.")
    if span < timedelta(seconds=60):
        raise WindowError("Choose a window of at least 1 minute.")
    if span > timedelta(days=366):
        raise WindowError("Choose a window of 366 days or less.")
    return resolved_start, resolved_end


def choose_bucket(span_seconds: float, target_points: int) -> int:
    """Pick a chart bucket size that stays near the requested point count."""

    if target_points < 1:
        raise ValueError("target_points must be positive")
    raw = max(1.0, span_seconds / target_points)
    for size in _NICE_BUCKETS:
        if size >= raw:
            return size
    return _NICE_BUCKETS[-1]


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
