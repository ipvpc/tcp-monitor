import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from tcpmon.db import engine, init_db
from tcpmon.monitor import ProbeBusy, scheduler_loop
from tcpmon.normalize import AddressError
from tcpmon.routes import router
from tcpmon.store import TargetNotFound
from tcpmon.window import WindowError

logger = logging.getLogger("tcpmon")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    logger.info("tcp monitor started")
    stop = asyncio.Event()
    task = asyncio.create_task(scheduler_loop(stop))
    try:
        yield
    finally:
        stop.set()
        try:
            await asyncio.wait_for(task, timeout=5)
        except TimeoutError:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        await engine.dispose()


def create_app() -> FastAPI:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    app = FastAPI(
        title="TCP Monitor",
        summary="Store and search latency history for hosts and URLs.",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    app.add_exception_handler(AddressError, _message_handler(422))
    app.add_exception_handler(WindowError, _message_handler(422))
    app.add_exception_handler(TargetNotFound, _message_handler(404, "Target not found."))
    app.add_exception_handler(
        ProbeBusy,
        _message_handler(409, "A check is already running for this target."),
    )
    return app


def _message_handler(status_code: int, fallback: str | None = None):
    async def handler(_request: Request, exc: Exception) -> JSONResponse:
        detail = fallback or str(exc)
        return JSONResponse(status_code=status_code, content={"detail": detail})

    return handler


app = create_app()
