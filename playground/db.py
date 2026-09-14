"""SQLite engine (WAL) and session helpers.

Sessions are short and synchronous; call them from async code through
`starlette.concurrency.run_in_threadpool` or use `run_db()` below.
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import contextmanager

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine
from starlette.concurrency import run_in_threadpool

from playground.config import get_settings

_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        settings = get_settings()
        settings.ensure_dirs()
        _engine = create_engine(
            f"sqlite:///{settings.db_path}",
            connect_args={"check_same_thread": False, "timeout": 5},
            pool_pre_ping=True,
        )

        @event.listens_for(_engine, "connect")
        def _pragmas(dbapi_conn, _record):  # pragma: no cover - trivial
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA busy_timeout=5000")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

    return _engine


def reset_engine_for_tests(url: str | None = None) -> Engine:
    """Replace the engine (used by tests with a temporary data dir)."""
    global _engine
    _engine = None
    get_settings.cache_clear()
    return get_engine()


def init_db() -> None:
    from playground import models  # noqa: F401  (register tables)

    SQLModel.metadata.create_all(get_engine())


@contextmanager
def session_scope():
    with Session(get_engine()) as session:
        yield session


async def run_db[T](fn: Callable[[Session], T]) -> T:
    """Run a synchronous DB function in the threadpool with its own session."""

    def _inner() -> T:
        with Session(get_engine()) as session:
            return fn(session)

    return await run_in_threadpool(_inner)
