import os
import shutil
import subprocess
from pathlib import Path

import pytest

SAMPLE = Path(__file__).parent / "fixtures" / "sample.mp4"


@pytest.fixture(scope="session")
def data_dir(tmp_path_factory):
    d = tmp_path_factory.mktemp("data")
    os.environ["TENNISAI_HOME"] = str(d)
    os.environ["DATA_DIR"] = str(d)
    os.environ["HOST_NAME"] = "test-host"
    os.environ["GEMINI_API_KEY"] = ""
    os.environ["OLLAMA_URL"] = ""
    from playground.config import get_settings

    get_settings.cache_clear()
    from playground import db

    db._engine = None
    return d


@pytest.fixture(scope="session")
def sample_video(data_dir):
    if not SAMPLE.exists():
        SAMPLE.parent.mkdir(parents=True, exist_ok=True)
        if shutil.which("ffmpeg") is None:
            pytest.skip("ffmpeg not installed")
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc=duration=4:size=640x360:rate=30",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=4",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-shortest",
                str(SAMPLE),
            ],
            check=True,
        )
    return SAMPLE


@pytest.fixture(scope="session")
def client(data_dir):
    from fastapi.testclient import TestClient

    from playground.main import app

    with TestClient(app) as c:
        yield c
