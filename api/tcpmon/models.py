"""Tables for monitored endpoints and latency history."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Target(Base):
    __tablename__ = "targets"
    __table_args__ = (
        CheckConstraint("kind IN ('tcp', 'http', 'https')", name="ck_targets_kind"),
        CheckConstraint("port BETWEEN 1 AND 65535", name="ck_targets_port"),
        CheckConstraint(
            "interval_seconds BETWEEN 5 AND 86400",
            name="ck_targets_interval",
        ),
        CheckConstraint("timeout_ms BETWEEN 100 AND 60000", name="ck_targets_timeout"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(8))
    host: Mapped[str] = mapped_column(String(255))
    port: Mapped[int] = mapped_column(Integer)
    path: Mapped[str] = mapped_column(String(2048), default="")
    interval_seconds: Mapped[int] = mapped_column(Integer)
    timeout_ms: Mapped[int] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    next_check_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_ok: Mapped[bool | None] = mapped_column(Boolean)
    last_latency_ms: Mapped[float | None] = mapped_column(Float)
    last_status_code: Mapped[int | None] = mapped_column(Integer)
    last_error: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Check(Base):
    __tablename__ = "checks"
    __table_args__ = (
        Index("ix_checks_target_checked_at", "target_id", "checked_at"),
        Index("ix_checks_checked_at", "checked_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    target_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("targets.id", ondelete="CASCADE"),
    )
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ok: Mapped[bool] = mapped_column(Boolean)
    latency_ms: Mapped[float | None] = mapped_column(Float)
    status_code: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(String(500))
