# PyInstaller spec for the desktop app. Build with:  uv run pyinstaller packaging/tennisai.spec
# Expects frontend/dist to be built and (on Windows) packaging/ffmpeg/{ffmpeg,ffprobe}.exe present.
import sys
from pathlib import Path

ROOT = Path(SPECPATH).parent
datas = [
    (str(ROOT / "frontend" / "dist"), "frontend/dist"),
    (str(ROOT / "playground" / "registry" / "models.yaml"), "playground/registry"),
    (str(ROOT / "playground" / "prompts" / "seed.yaml"), "playground/prompts"),
]
ffmpeg_dir = ROOT / "packaging" / "ffmpeg"
if ffmpeg_dir.exists():
    datas.append((str(ffmpeg_dir), "ffmpeg"))

icon = ROOT / "packaging" / "icon.ico"

a = Analysis(
    [str(ROOT / "playground" / "desktop.py")],
    pathex=[str(ROOT)],
    datas=datas,
    hiddenimports=[
        "uvicorn.logging", "uvicorn.loops.auto", "uvicorn.loops.asyncio", "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl", "uvicorn.protocols.http.httptools_impl", "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan.on", "uvicorn.lifespan.off",
        "pystray._win32" if sys.platform == "win32" else "pystray._xorg",
        "PIL.Image", "PIL.ImageDraw", "pynvml", "sse_starlette", "sqlalchemy.dialects.sqlite",
        "google.genai", "playground.main", "playground.api", "playground.providers.gemini",
        "playground.providers.ollama", "playground.providers.openai_compat", "playground.providers.mock",
    ],
    excludes=["tkinter", "pytest", "IPython"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="TennisAI",
    debug=False,
    strip=False,
    upx=False,
    console=sys.platform != "win32",
    icon=str(icon) if icon.exists() else None,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="TennisAI")
