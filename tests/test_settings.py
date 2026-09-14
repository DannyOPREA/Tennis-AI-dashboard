def test_settings_roundtrip_and_setup(client, data_dir):
    s = client.get("/api/settings").json()
    assert (
        s["gemini_key_set"] is False
        and s["packaged"] is False
        and s["env_file"].startswith(str(data_dir))
    )
    r = client.put(
        "/api/settings",
        json={
            "gemini_api_key": "abcdefgh1234",
            "host_name": "bench-1",
            "energy_price_per_kwh": 0.3,
        },
    )
    assert r.status_code == 200
    s = r.json()
    assert (
        s["gemini_key_set"] is True
        and s["gemini_key_hint"] == "…1234"
        and s["host_name"] == "bench-1"
    )
    assert "abcdefgh1234" not in str(s)
    env = (data_dir / ".env").read_text()
    assert (
        "GEMINI_API_KEY=abcdefgh1234" in env
        and "HOST_NAME=bench-1" in env
        and "ENERGY_PRICE_PER_KWH=0.3" in env
    )
    assert client.get("/api/health").json()["gemini_configured"] is True
    assert client.put("/api/settings", json={"ollama_url": "localhost:11434"}).status_code == 422
    client.put("/api/settings", json={"gemini_api_key": ""})
    assert client.get("/api/settings").json()["gemini_key_set"] is False
    setup = client.get("/api/setup").json()
    assert (
        setup["complete"] is False
        and setup["models_total_local"] >= 4
        and setup["ollama_reachable"] is False
    )
    assert client.get("/api/ollama/pulls").json() == []
    assert (
        client.post("/api/ollama/pull", json={"model_config_id": "gemini-3.6-flash"}).status_code
        == 422
    )
    assert (
        client.post("/api/ollama/pull", json={"model_config_id": "qwen3.5-9b"}).status_code == 503
    )  # no OLLAMA_URL
    assert client.post("/api/settings/test-gemini", json={}).json()["ok"] is False
