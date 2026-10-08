import asyncio
import logging

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from tcpmon.config import get_settings
from tcpmon.models import Base

logger = logging.getLogger("tcpmon.db")

engine = create_async_engine(
    get_settings().sqlalchemy_url(),
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def init_db() -> None:
    """Create tables, retrying while Postgres is still starting."""

    delay = 1.0
    for attempt in range(1, 31):
        try:
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
        except Exception as exc:
            logger.warning("waiting for database (%s/30): %s", attempt, exc)
            if attempt == 30:
                raise
            await asyncio.sleep(delay)
            delay = min(delay * 1.5, 5)
            continue
        logger.info("database ready")
        return
