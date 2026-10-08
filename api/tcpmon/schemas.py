from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from tcpmon.normalize import Endpoint

Kind = Literal["tcp", "http", "https"]


class TargetWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    address: str = Field(
        min_length=1,
        max_length=2048,
        examples=["db.internal:5432", "https://example.com/health"],
    )
    interval_seconds: int = Field(default=30, ge=5, le=86400)
    timeout_ms: int = Field(default=5000, ge=100, le=60000)
    enabled: bool = True

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("Name is required.")
        return text


class TargetUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    address: str | None = Field(default=None, min_length=1, max_length=2048)
    interval_seconds: int | None = Field(default=None, ge=5, le=86400)
    timeout_ms: int | None = Field(default=None, ge=100, le=60000)
    enabled: bool | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        if not text:
            raise ValueError("Name is required.")
        return text


class AddressBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    address: str = Field(min_length=1, max_length=2048)


class ProbeRequest(AddressBody):
    timeout_ms: int = Field(default=5000, ge=100, le=60000)


class TargetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    kind: Kind
    host: str
    port: int
    path: str
    interval_seconds: int
    timeout_ms: int
    enabled: bool
    last_checked_at: datetime | None
    last_ok: bool | None
    last_latency_ms: float | None
    last_status_code: int | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def endpoint(self) -> str:
        return Endpoint(self.kind, self.host, self.port, self.path).display


class WindowStats(BaseModel):
    samples: int = 0
    ok_count: int = 0
    uptime: float | None = None
    min_ms: float | None = None
    avg_ms: float | None = None
    p95_ms: float | None = None
    max_ms: float | None = None


class TargetSummary(TargetOut):
    stats: WindowStats = Field(default_factory=WindowStats)
    spark: list[float | None] = Field(default_factory=list)


class TargetListResponse(BaseModel):
    start: datetime
    end: datetime
    retention_days: int
    targets: list[TargetSummary]


class SeriesPoint(BaseModel):
    t: datetime
    avg_ms: float | None
    min_ms: float | None
    max_ms: float | None
    samples: int
    failures: int


class SeriesResponse(BaseModel):
    start: datetime
    end: datetime
    bucket_seconds: int
    stats: WindowStats
    points: list[SeriesPoint]


class CheckOut(BaseModel):
    id: int
    checked_at: datetime
    ok: bool
    latency_ms: float | None
    status_code: int | None
    error: str | None


class CheckPage(BaseModel):
    total: int
    limit: int
    offset: int
    checks: list[CheckOut]


class AddressPreview(BaseModel):
    kind: Kind
    endpoint: str
    host: str
    port: int
    path: str


class ProbePreview(BaseModel):
    ok: bool
    latency_ms: float | None = None
    status_code: int | None = None
    error: str | None = None
    endpoint: str
    kind: Kind


class ProbeRun(ProbePreview):
    checked_at: datetime


class MetaResponse(BaseModel):
    retention_days: int
