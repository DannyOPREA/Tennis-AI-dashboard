import time


def test_health_and_registry(client):
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["host"] == "test-host" and h["gemini_configured"] is False
    models = client.get("/api/models").json()
    ids = {m["id"] for m in models}
    assert "gemini-2.5-flash-lite" in ids and "qwen3.5-9b" in ids
    gem = next(m for m in models if m["id"] == "gemini-2.5-flash-lite")
    assert gem["availability"] == {"available": False, "reason": "GEMINI_API_KEY not set"}
    presets = client.get("/api/frame-presets").json()
    assert {p["key"] for p in presets} == {"light16", "dense24", "quick"}


def test_prompts_seeded_and_versioned(client):
    prompts = client.get("/api/prompts").json()
    assert len(prompts) == 4
    p = prompts[0]
    assert p["versions"][0]["version"] == 1 and p["versions"][0]["output_language"] == "fr"
    r = client.post(
        f"/api/prompts/{p['id']}/versions",
        json={"system_text": "s", "user_text": "u", "output_language": "fr"},
    )
    assert r.status_code == 201 and r.json()["versions"][-1]["version"] == 2
    assert (
        client.patch(f"/api/prompts/{p['id']}", json={"name": "Renamed"}).json()["name"]
        == "Renamed"
    )


def test_spa_fallback_and_api_404(client):
    assert client.get("/api/does-not-exist").status_code == 404
    r = client.get("/runs/42")
    assert r.status_code in (200, 503)  # index.html if the frontend is built, else a clear 503


def test_video_upload_and_batch_lifecycle(client, sample_video):
    with open(sample_video, "rb") as f:
        r = client.post(
            "/api/videos",
            files={"file": ("sample.mp4", f, "video/mp4")},
            data={"title": "Sample", "tags": "test, forehand"},
        )
    assert r.status_code == 201, r.text
    v = r.json()
    assert v["duration_s"] > 3 and v["has_audio"] is True and v["tags"] == ["test", "forehand"]
    with open(sample_video, "rb") as f:
        dup = client.post("/api/videos", files={"file": ("sample.mp4", f, "video/mp4")})
    assert dup.status_code == 200 and dup.json()["id"] == v["id"]
    assert client.get(f"/api/videos/{v['id']}/thumbnail").headers["content-type"] == "image/jpeg"
    ranged = client.get(f"/api/videos/{v['id']}/file", headers={"Range": "bytes=0-99"})
    assert ranged.status_code == 206 and len(ranged.content) == 100

    prompts = client.get("/api/prompts").json()
    pv_id = prompts[0]["latest_version_id"]
    est = client.post(
        "/api/estimate",
        json={
            "video_id": v["id"],
            "prompt_version_id": pv_id,
            "frame_preset": "quick",
            "targets": [
                {"model_config_id": "qwen3.5-9b", "input_mode": "frames"},
                {"model_config_id": "gemini-2.5-flash-lite", "input_mode": "native_video"},
            ],
        },
    )
    assert est.status_code == 200, est.text
    rows = {e["model_config_id"]: e for e in est.json()}
    assert rows["qwen3.5-9b"]["frames"] == 4 and rows["qwen3.5-9b"]["est_tokens_in"] > 4 * 350
    assert "OLLAMA_URL not set" in rows["qwen3.5-9b"]["warnings"]
    assert rows["gemini-2.5-flash-lite"]["exact"] is False

    # Gemini is not configured, so the run must fail fast with a recorded error and populated payload
    b = client.post(
        "/api/batches",
        json={
            "video_id": v["id"],
            "prompt_version_id": pv_id,
            "frame_preset": "quick",
            "targets": [{"model_config_id": "gemini-2.5-flash-lite", "input_mode": "frames"}],
            "blind": True,
        },
    )
    assert b.status_code == 201, b.text
    batch = b.json()
    run_id = batch["runs"][0]["id"]
    for _ in range(50):
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] in ("done", "error"):
            break
        time.sleep(0.2)
    assert run["status"] == "error" and "GEMINI_API_KEY" in run["error"]
    assert (
        run["blind"] is True and run["metrics"]["extract_ms"] is None
    )  # provider failed before extraction was persisted
    frames = client.get(f"/api/runs/{run_id}/frames").json()
    assert frames["count"] == 4 and frames["contact_sheet_url"]
    assert client.get(frames["frames"][0]["url"]).headers["content-type"] == "image/jpeg"

    rating = client.put(f"/api/runs/{run_id}/rating", json={"stars": 4, "notes": "ok"})
    assert rating.status_code == 200 and rating.json()["blind"] is True
    again = client.put(f"/api/runs/{run_id}/rating", json={"stars": 2})
    assert again.json()["id"] == rating.json()["id"] and again.json()["stars"] == 2
    assert client.get(f"/api/runs/{run_id}").json()["rating"]["stars"] == 2

    summary = client.get("/api/batches").json()
    assert summary[0]["counts"]["error"] == 1
    export = client.get(f"/api/batches/{batch['id']}/export")
    assert export.status_code == 200 and export.json()["ratings"][0]["stars"] == 2
    retry = client.post(f"/api/runs/{run_id}/retry")
    assert retry.status_code == 201 and retry.json()["retries"] == 1
    assert client.get("/api/dashboard/filters").json()["hosts"] == ["test-host"]
    assert client.get("/api/dashboard/summary").json() == []  # no done runs
    assert client.delete(f"/api/videos/{v['id']}").status_code == 409
