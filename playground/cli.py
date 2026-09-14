"""`uv run playground` entry point."""

from __future__ import annotations

import argparse
import logging

import uvicorn

from playground.config import get_settings


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="playground", description="Tennis AI model playground server"
    )
    parser.add_argument(
        "--reload", action="store_true", help="auto-reload on code changes (development)"
    )
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument(
        "--host",
        default=None,
        help="bind address (default 127.0.0.1; keep it local, the API fronts a paid key)",
    )
    args = parser.parse_args()
    settings = get_settings()
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    uvicorn.run(
        "playground.main:app",
        host=args.host or settings.bind_host,
        port=args.port or settings.port,
        reload=args.reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()
