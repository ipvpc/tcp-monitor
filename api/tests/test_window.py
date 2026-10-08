from datetime import datetime, timedelta, timezone

import pytest

from tcpmon.window import WindowError, choose_bucket, resolve_window


def test_default_window_is_the_last_hour():
    now = datetime(2026, 10, 8, 15, 0, tzinfo=timezone.utc)
    start, end = resolve_window(None, None, now=now)
    assert end == now
    assert start == now - timedelta(hours=1)


def test_naive_datetimes_are_utc():
    start, end = resolve_window(
        datetime(2026, 10, 8, 14, 0),
        datetime(2026, 10, 8, 15, 0),
    )
    assert start.tzinfo == timezone.utc
    assert end.tzinfo == timezone.utc


def test_window_limits():
    start = datetime(2026, 10, 8, 15, 0, tzinfo=timezone.utc)
    assert resolve_window(start, start + timedelta(seconds=60)) == (
        start,
        start + timedelta(seconds=60),
    )
    with pytest.raises(WindowError):
        resolve_window(start, start + timedelta(seconds=59))
    with pytest.raises(WindowError):
        resolve_window(start, start)
    resolve_window(start, start + timedelta(days=366))
    with pytest.raises(WindowError):
        resolve_window(start, start + timedelta(days=366, seconds=1))


def test_choose_bucket_uses_readable_sizes():
    assert choose_bucket(3600, 160) == 30
    assert choose_bucket(3600, 32) == 120
    assert choose_bucket(10, 160) == 1
