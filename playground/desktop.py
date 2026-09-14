"""Desktop launcher used by the packaged app (TennisAI.exe).

Starts the server in a background thread, opens the browser, and sits in the system tray with
Open / Quit. If the server is already running (a second click on the icon) it just opens the browser.
"""

from __future__ import annotations

import argparse
import logging
import logging.handlers
import os
import subprocess
import sys
import threading
import time
import webbrowser

import httpx
import uvicorn

from playground.config import APP_VERSION, app_home, ensure_ffmpeg_on_path, get_settings

log = logging.getLogger("playground.desktop")


def _setup_logging(logs_dir) -> None:
    logs_dir.mkdir(parents=True, exist_ok=True)
    handler = logging.handlers.RotatingFileHandler(
        logs_dir / "app.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8"
    )
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    handler.setFormatter(fmt)
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(handler)
    if sys.stdout and sys.stdout.isatty():
        console = logging.StreamHandler()
        console.setFormatter(fmt)
        root.addHandler(console)


def _health(url: str) -> bool:
    try:
        return httpx.get(f"{url}/api/health", timeout=1.5).status_code == 200
    except httpx.HTTPError:
        return False


def _open_folder(path) -> None:
    try:
        if sys.platform == "win32":
            os.startfile(str(path))  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(path)])
        else:
            subprocess.Popen(["xdg-open", str(path)])
    except OSError:
        log.exception("could not open %s", path)


def _run_tray(url: str, data_dir, stop: threading.Event) -> None:
    try:
        import pystray
        from PIL import Image, ImageDraw
    except Exception:  # noqa: BLE001 - no tray support (headless Linux, missing deps)
        log.info("tray unavailable; press Ctrl+C to quit")
        try:
            while not stop.is_set():
                time.sleep(0.5)
        except KeyboardInterrupt:
            stop.set()
        return

    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((4, 4, 60, 60), fill=(158, 59, 38, 255))
    d.arc((12, -20, 52, 40), 20, 160, fill=(246, 247, 245, 255), width=5)
    d.arc((12, 24, 52, 84), 200, 340, fill=(246, 247, 245, 255), width=5)

    def on_open(_icon, _item):
        webbrowser.open(url)

    def on_folder(_icon, _item):
        _open_folder(data_dir)

    def on_quit(icon, _item):
        stop.set()
        icon.stop()

    icon = pystray.Icon(
        "TennisAI",
        img,
        f"Tennis AI Playground {APP_VERSION}",
        menu=pystray.Menu(
            pystray.MenuItem("Open Tennis AI", on_open, default=True),
            pystray.MenuItem("Open data folder", on_folder),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Quit", on_quit),
        ),
    )
    icon.run()


def main() -> None:
    parser = argparse.ArgumentParser(prog="TennisAI")
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--no-tray", action="store_true")
    args = parser.parse_args()

    ensure_ffmpeg_on_path()
    settings = get_settings()
    settings.ensure_dirs()
    _setup_logging(settings.logs_dir)
    port = args.port or settings.port
    url = f"http://{settings.bind_host}:{port}"
    log.info("Tennis AI Playground %s starting; home=%s", APP_VERSION, app_home())

    if _health(url):
        log.info("server already running at %s; opening browser", url)
        if not args.no_browser:
            webbrowser.open(url)
        return

    config = uvicorn.Config(
        "playground.main:app", host=settings.bind_host, port=port, log_level="info", log_config=None
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, name="uvicorn", daemon=True)
    thread.start()

    for _ in range(120):
        if _health(url):
            break
        if not thread.is_alive():
            log.error("server thread exited during startup; see app.log")
            sys.exit(1)
        time.sleep(0.25)
    else:
        log.error("server did not become healthy at %s", url)
        sys.exit(1)

    log.info("ready at %s", url)
    if not args.no_browser:
        webbrowser.open(url)

    stop = threading.Event()
    if args.no_tray:
        try:
            while not stop.is_set():
                time.sleep(0.5)
        except KeyboardInterrupt:
            pass
    else:
        _run_tray(url, settings.data_dir, stop)

    log.info("shutting down")
    server.should_exit = True
    thread.join(timeout=10)


if __name__ == "__main__":
    main()
