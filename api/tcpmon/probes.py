"""Measure TCP connect time or HTTP response time."""

import asyncio
import socket
from dataclasses import dataclass
from typing import cast

import httpx

from tcpmon.normalize import Endpoint, Kind


@dataclass(frozen=True)
class ProbeSpec:
    kind: str
    host: str
    port: int
    path: str
    timeout_ms: int


@dataclass(frozen=True)
class ProbeResult:
    ok: bool
    latency_ms: float | None
    status_code: int | None = None
    error: str | None = None


def friendly_error(exc: BaseException) -> str:
    if isinstance(exc, TimeoutError):
        return "Timed out"
    if isinstance(exc, ConnectionRefusedError):
        return "Connection refused"
    text = str(exc).strip() or exc.__class__.__name__
    lowered = text.lower()
    if (
        isinstance(exc, socket.gaierror)
        or "getaddrinfo" in lowered
        or "nodename" in lowered
        or "name or service not known" in lowered
        or "no address associated" in lowered
    ):
        return "Could not resolve host"
    return text[:500]


async def probe_spec(spec: ProbeSpec) -> ProbeResult:
    return await probe_endpoint(_as_endpoint(spec), spec.timeout_ms)


def _as_endpoint(spec: ProbeSpec) -> Endpoint:
    if spec.kind not in ("tcp", "http", "https"):
        raise ValueError(f"unsupported kind {spec.kind}")
    return Endpoint(cast(Kind, spec.kind), spec.host, spec.port, spec.path)


async def probe_endpoint(endpoint: Endpoint, timeout_ms: int) -> ProbeResult:
    if endpoint.kind == "tcp":
        return await probe_tcp(endpoint.host, endpoint.port, timeout_ms)
    return await probe_http(endpoint, timeout_ms)


async def probe_tcp(host: str, port: int, timeout_ms: int) -> ProbeResult:
    start = asyncio.get_running_loop().time()
    try:
        _reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port),
            timeout_ms / 1000,
        )
    except Exception as exc:
        return ProbeResult(ok=False, latency_ms=None, error=friendly_error(exc))
    latency_ms = round((asyncio.get_running_loop().time() - start) * 1000, 2)
    writer.close()
    try:
        await writer.wait_closed()
    except Exception:
        pass
    return ProbeResult(ok=True, latency_ms=latency_ms)


async def probe_http(endpoint: Endpoint, timeout_ms: int) -> ProbeResult:
    """Time until response headers, including DNS, connect, and TLS."""

    timeout_s = timeout_ms / 1000
    start = asyncio.get_running_loop().time()
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_s),
            follow_redirects=True,
            trust_env=False,
            headers={"User-Agent": "tcp-monitor/1.0"},
        ) as client:
            async with client.stream("GET", endpoint.display) as response:
                latency_ms = round((asyncio.get_running_loop().time() - start) * 1000, 2)
                ok = response.status_code < 400
                error = None if ok else f"HTTP {response.status_code}"
                return ProbeResult(
                    ok=ok,
                    latency_ms=latency_ms,
                    status_code=response.status_code,
                    error=error,
                )
    except httpx.TimeoutException:
        return ProbeResult(ok=False, latency_ms=None, error="Timed out")
    except httpx.HTTPError as exc:
        return ProbeResult(ok=False, latency_ms=None, error=friendly_error(exc))
