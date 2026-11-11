import json
from pathlib import Path

from fastapi.testclient import TestClient

from src.app import READINGS, app, load_readings, playback_delay

ROOT = Path(__file__).resolve().parents[1]


def test_fixture_rows_are_validated_and_strictly_ordered(tmp_path: Path) -> None:
    fixture = json.loads((ROOT / "demo_fixtures" / "vitals.json").read_text(encoding="utf-8"))
    assert len(load_readings(ROOT / "demo_fixtures" / "vitals.json")) == len(fixture)
    fixture[1]["timestamp"] = fixture[0]["timestamp"]
    path = tmp_path / "duplicate.json"
    path.write_text(json.dumps(fixture), encoding="utf-8")
    try:
        load_readings(path)
    except ValueError as error:
        assert "strictly increasing" in str(error)
    else:
        raise AssertionError("duplicate timestamps must be rejected")


def test_playback_speed_maps_to_wall_clock_interval() -> None:
    assert playback_delay(1) == 1
    assert playback_delay(2) == 0.5
    assert playback_delay(0.5) == 2
    for speed in (0, 0.1, 11, float("inf"), True):
        try:
            playback_delay(speed)
        except ValueError:
            continue
        raise AssertionError(f"unsupported speed {speed!r} must be rejected")


def test_http_api_documents_health_state_baselines_alerts_and_research() -> None:
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["is_simulated"] is True
        assert health.json()["readings"] == len(READINGS)
        assert client.get("/api/state").json()["is_simulated"] is True
        assert client.get("/api/baselines").status_code == 200
        assert client.get("/api/alerts?limit=101").status_code == 422
        assert client.get("/api/research").json()["records"][0]["study_id"] == "NASA NTRS 20040087874"
        assert "/api/state" in client.get("/openapi.json").json()["paths"]


def test_websocket_replay_order_speed_pause_resume_restart_and_disconnect() -> None:
    with TestClient(app) as client:
        with client.websocket_connect("/ws/vitals") as websocket:
            hello = websocket.receive_json()
            assert hello["type"] == "status"
            assert hello["status"] == "playing"
            first = websocket.receive_json()
            assert first["type"] == "telemetry"
            assert first["sequence"] == 0
            assert first["reading"]["is_simulated"] is True
            assert first["reading"]["crew_member_id"]

            websocket.send_json({"type": "speed", "value": 10})
            assert websocket.receive_json()["value"] == 10
            websocket.send_json({"type": "pause"})
            assert websocket.receive_json()["status"] == "paused"
            websocket.send_json({"type": "resume"})
            assert websocket.receive_json()["status"] == "playing"
            next_frame = websocket.receive_json()
            assert next_frame["type"] == "telemetry"
            assert next_frame["sequence"] == 1

            websocket.send_json({"type": "pause"})
            assert websocket.receive_json()["status"] == "paused"
            websocket.send_json({"type": "restart"})
            restarted_status = websocket.receive_json()
            assert restarted_status["replay_reset"] is True
            restarted = websocket.receive_json()
            assert restarted["sequence"] == 0
            assert restarted["replay_reset"] is True

            websocket.send_text("{malformed")
            error = websocket.receive_json()
            assert error["type"] == "error"
            assert error["code"] == "invalid_command"
            websocket.send_json({"type": "speed", "value": 20})
            error = websocket.receive_json()
            assert error["type"] == "error"
            assert error["code"] == "invalid_command"
    assert app.state.connection_count == 0


def test_websocket_fixture_completes_in_order_without_implicit_loop() -> None:
    with TestClient(app) as client:
        with client.websocket_connect("/ws/vitals") as websocket:
            websocket.receive_json()
            first = websocket.receive_json()
            websocket.send_json({"type": "speed", "value": 10})
            assert websocket.receive_json()["type"] == "speed"
            frames = [first]
            for _ in range(len(READINGS) - 1):
                frames.append(websocket.receive_json())
            completed = websocket.receive_json()
            assert completed["status"] == "completed"
            assert [frame["sequence"] for frame in frames] == list(range(len(READINGS)))
            assert len({frame["reading"]["timestamp"] for frame in frames}) == len(READINGS)
            anomaly = frames[-1]
            hrv_alert = next(alert for alert in anomaly["alerts"] if alert["rule_id"] == "hrv_below_personal_baseline")
            assert hrv_alert["current_value"] == 26
            assert hrv_alert["baseline_sample_count"] == 30
            assert hrv_alert["z_score"] <= -2
            assert hrv_alert["is_simulated"] is True
            explanation = anomaly["explanations"][0]
            assert explanation["alert_id"] == hrv_alert["alert_id"]
            assert explanation["alert"] == hrv_alert
            assert explanation["studies"][0]["study_id"] == "NASA NTRS 20040087874"
            websocket.send_json({
                "type": "explanation_result",
                "alert_id": hrv_alert["alert_id"],
                "text": explanation["text"] + " You should take medication.",
            })
            assert websocket.receive_json()["safe"] is False
            websocket.send_json({
                "type": "explanation_result",
                "alert_id": hrv_alert["alert_id"],
                "text": explanation["text"],
            })
            assert websocket.receive_json()["safe"] is True
            stored = client.get(f"/api/explanations/{hrv_alert['alert_id']}")
            assert stored.status_code == 200
            assert stored.json()["alert_id"] == hrv_alert["alert_id"]


def test_api_rejects_explanations_for_unknown_alerts() -> None:
    with TestClient(app) as client:
        response = client.get("/api/explanations/unknown-alert")
        assert response.status_code == 404
        assert response.json()["error"] == "request_error"
