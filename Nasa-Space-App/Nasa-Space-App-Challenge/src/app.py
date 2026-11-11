from __future__ import annotations

import asyncio
import json
import os
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse

from src.compute import RollingDetector
from src.compute.schemas import Alert, ReplayCommand, SignalState, TelemetryReading
from src.explanation import FALLBACK_TEXT, SYSTEM_PROMPT, explain_alert, validate_model_explanation
from src.research import load_research_cache, studies_for_signal

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / "demo_fixtures" / "vitals.json"
STUDIES_PATH = ROOT / "demo_fixtures" / "research_metadata.json"
MIN_SPEED = 0.25
MAX_SPEED = 10.0
MAX_FIXTURE_BYTES = 1_000_000
MAX_WEBSOCKET_MESSAGE_BYTES = 4096
MAX_WEBSOCKET_CLIENTS = 20
MAX_RECENT_ALERTS = 100


def load_json(path: Path) -> Any:
    if path.stat().st_size > MAX_FIXTURE_BYTES:
        raise ValueError(f"Fixture exceeds the {MAX_FIXTURE_BYTES}-byte size limit: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"Fixture contains malformed JSON: {path}:{error.lineno}:{error.colno}") from error


def load_readings(path: Path = FIXTURE_PATH) -> list[dict[str, Any]]:
    raw_readings = load_json(path)
    if not isinstance(raw_readings, list) or not raw_readings or len(raw_readings) > 10_000:
        raise ValueError(f"Telemetry fixture must contain 1 to 10,000 rows: {path}")
    readings: list[dict[str, Any]] = []
    previous_timestamp: datetime | None = None
    for index, raw_reading in enumerate(raw_readings):
        try:
            reading = TelemetryReading.model_validate(raw_reading)
        except ValidationError as error:
            raise ValueError(f"Invalid telemetry fixture row {index}: {error}") from error
        if previous_timestamp is not None and reading.timestamp <= previous_timestamp:
            raise ValueError(f"Telemetry fixture timestamps must be unique and strictly increasing (row {index}).")
        previous_timestamp = reading.timestamp
        readings.append(reading.model_dump(mode="json"))
    return readings


def _configured_origins() -> list[str]:
    raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    origins = [origin.strip().rstrip("/") for origin in raw_origins.split(",") if origin.strip()]
    for origin in origins:
        parsed = urlparse(origin)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path:
            raise ValueError("CORS_ORIGINS must contain comma-separated HTTP(S) origins without paths.")
    return origins


READINGS = load_readings()
RESEARCH = load_research_cache(STUDIES_PATH)
ALLOWED_ORIGINS = _configured_origins()
app = FastAPI(
    title="Crew Health Monitoring Console",
    description="Deterministic anomaly detection over explicitly simulated telemetry.",
    version="1.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.state.latest_frame = None
app.state.recent_alerts = deque(maxlen=MAX_RECENT_ALERTS)
app.state.known_alerts = {}
app.state.known_alert_order = deque()
app.state.connection_count = 0
app.state.replay_status = "idle"
app.state.connection_lock = asyncio.Lock()


def playback_delay(speed: float) -> float:
    if isinstance(speed, bool) or not MIN_SPEED <= speed <= MAX_SPEED:
        raise ValueError(f"Replay speed must be from {MIN_SPEED}x to {MAX_SPEED}x.")
    return 1.0 / speed


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Any, error: StarletteHTTPException) -> JSONResponse:
    del request
    return JSONResponse(
        status_code=error.status_code,
        content={"error": "request_error", "message": str(error.detail)},
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Any, error: RequestValidationError) -> JSONResponse:
    del request, error
    return JSONResponse(
        status_code=422,
        content={"error": "validation_error", "message": "Request did not match the documented API schema."},
    )


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "source": "simulated_fixture",
        "is_simulated": True,
        "readings": len(READINGS),
        "websocket_clients": app.state.connection_count,
    }


@app.get("/api/state")
async def current_state() -> dict[str, Any]:
    if app.state.latest_frame:
        return {**app.state.latest_frame, "status": app.state.replay_status}
    return {
        "status": "idle",
        "reading": None,
        "signals": {},
        "alerts": [],
        "summary": "Replay has not started.",
        "source": "simulated_fixture",
        "is_simulated": True,
    }


@app.get("/api/baselines")
async def current_baselines() -> dict[str, Any]:
    frame = app.state.latest_frame
    status = (
        "idle" if frame is None else
        "ready" if all(signal["baseline"]["status"] == "ready" for signal in frame["signals"].values()) else
        "incomplete"
    )
    return {
        "timestamp": frame["reading"]["timestamp"] if frame else None,
        "status": status,
        "signals": {
            key: value["baseline"] for key, value in frame["signals"].items()
        } if frame else {},
        "is_simulated": True,
    }


@app.get("/api/alerts")
async def recent_alerts(
    limit: int = Query(default=50, ge=1, le=MAX_RECENT_ALERTS),
    signal: str | None = None,
    rule_id: str | None = Query(default=None, max_length=100),
) -> dict[str, Any]:
    items = list(app.state.recent_alerts)
    if signal is not None:
        items = [item for item in items if item.get("signal") == signal or any(contributor["signal"] == signal for contributor in item["contributing_signals"])]
    if rule_id is not None:
        items = [item for item in items if item["rule_id"] == rule_id]
    return {"alerts": items[-limit:][::-1], "count": len(items[-limit:]), "is_simulated": True}


@app.get("/api/research")
async def research_metadata() -> dict[str, Any]:
    return {
        "records": RESEARCH,
        "message": "Only verified records are attached to alerts; unverified entries are not cited.",
    }


@app.get("/api/explanations/{alert_id}")
async def get_explanation(alert_id: str) -> dict[str, Any]:
    explanation = app.state.known_alerts.get(alert_id)
    if explanation is None:
        raise HTTPException(status_code=404, detail="No replayed alert with this identifier is available.")
    return explanation


@app.post("/api/explain")
async def explain(alert: Alert) -> dict[str, Any]:
    known = app.state.known_alerts.get(alert.alert_id)
    if known is None or known["alert"] != alert.model_dump(mode="json"):
        raise HTTPException(status_code=404, detail="Explanation is available only for an alert produced by this replay.")
    return {key: value for key, value in known.items() if key != "system_prompt"}


def _remember_frame(frame: dict[str, Any]) -> None:
    app.state.latest_frame = frame
    for alert in frame["alerts"]:
        app.state.recent_alerts.append(alert)


def _build_explanation(alert: dict[str, Any]) -> dict[str, Any]:
    studies = studies_for_signal(alert.get("signal"), RESEARCH)
    explanation = explain_alert(alert, studies)
    return {
        "alert_id": alert["alert_id"],
        **explanation,
        "alert": alert,
        "studies": studies,
        "system_prompt": SYSTEM_PROMPT,
    }


async def _send_error(websocket: WebSocket, code: str, message: str) -> None:
    await websocket.send_json({"type": "error", "code": code, "message": message})


async def _command_loop(
    websocket: WebSocket,
    *,
    timeout: float | None,
    state: dict[str, Any],
    detector_ref: list[RollingDetector],
    known_explanations: dict[str, dict[str, Any]],
) -> bool:
    try:
        if timeout is None:
            raw = await websocket.receive_text()
        else:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=timeout)
    except asyncio.TimeoutError:
        state["last_command"] = "timeout"
        return True
    except WebSocketDisconnect:
        return False

    if len(raw.encode("utf-8")) > MAX_WEBSOCKET_MESSAGE_BYTES:
        state["last_command"] = "other"
        await _send_error(websocket, "message_too_large", "Control messages are limited to 4096 bytes.")
        return True
    try:
        command = ReplayCommand.model_validate_json(raw)
    except (ValidationError, ValueError):
        state["last_command"] = "other"
        await _send_error(websocket, "invalid_command", "Use a supported JSON control command with valid fields.")
        return True
    state["last_command"] = command.type

    if command.type == "explanation_result":
        known = known_explanations.get(command.alert_id or "")
        safe = bool(
            known
            and command.text is not None
            and validate_model_explanation(known["alert"], known["studies"], command.text)
        )
        await websocket.send_json({
            "type": "explanation_result",
            "alert_id": command.alert_id,
            "safe": safe,
            "text": command.text if safe else None,
            "fallback": FALLBACK_TEXT if not safe else None,
        })
        return True

    if command.type == "speed":
        state["speed"] = command.value
        await websocket.send_json({"type": "speed", "value": state["speed"], "status": state["status"]})
    elif command.type == "pause":
        if state["status"] == "playing":
            state["status"] = "paused"
        app.state.replay_status = state["status"]
        await websocket.send_json({"type": "status", "status": state["status"], "speed": state["speed"]})
    elif command.type == "resume":
        if state["status"] == "paused":
            state["status"] = "playing"
        elif state["status"] == "completed":
            await _send_error(websocket, "replay_completed", "Replay is complete; send restart to play it again.")
            return True
        app.state.replay_status = state["status"]
        await websocket.send_json({"type": "status", "status": state["status"], "speed": state["speed"]})
    elif command.type == "restart":
        state["index"] = 0
        state["status"] = "playing"
        state["replay_reset"] = True
        detector_ref[0] = RollingDetector()
        known_explanations.clear()
        app.state.replay_status = "playing"
        await websocket.send_json({"type": "status", "status": "playing", "speed": state["speed"], "replay_reset": True})
    return True


@app.websocket("/ws/vitals")
async def replay_vitals(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    if origin is not None and origin.rstrip("/") not in ALLOWED_ORIGINS:
        await websocket.close(code=1008, reason="Origin is not allowed.")
        return
    async with app.state.connection_lock:
        if app.state.connection_count >= MAX_WEBSOCKET_CLIENTS:
            await websocket.close(code=1013, reason="Replay client limit reached.")
            return
        app.state.connection_count += 1
    state: dict[str, Any] = {
        "index": 0,
        "speed": 1.0,
        "status": "playing",
        "replay_reset": False,
        "last_command": None,
    }
    detector_ref = [RollingDetector()]
    known_explanations: dict[str, dict[str, Any]] = {}
    try:
        await websocket.accept()
        app.state.replay_status = "playing"
        await websocket.send_json({
            "type": "status",
            "status": state["status"],
            "speed": state["speed"],
            "source": "simulated_fixture",
            "is_simulated": True,
        })
        while True:
            if state["status"] == "playing":
                index = state["index"]
                result = detector_ref[0].evaluate(READINGS[index])
                validated_signals = {
                    key: SignalState.model_validate(value).model_dump(mode="json")
                    for key, value in result["signals"].items()
                }
                explanations = []
                validated_alerts = []
                for alert in result["alerts"]:
                    validated_alert = Alert.model_validate(alert).model_dump(mode="json")
                    validated_alerts.append(validated_alert)
                    explanation = _build_explanation(validated_alert)
                    known_explanations[validated_alert["alert_id"]] = explanation
                    if validated_alert["alert_id"] not in app.state.known_alerts:
                        app.state.known_alert_order.append(validated_alert["alert_id"])
                    app.state.known_alerts[validated_alert["alert_id"]] = explanation
                    while len(app.state.known_alert_order) > MAX_RECENT_ALERTS:
                        expired_id = app.state.known_alert_order.popleft()
                        app.state.known_alerts.pop(expired_id, None)
                    explanations.append(explanation)
                frame = {
                    **result,
                    "type": "telemetry",
                    "signals": validated_signals,
                    "alerts": validated_alerts,
                    "sequence": index,
                    "status": "playing",
                    "replay_reset": state["replay_reset"],
                    "explanations": explanations,
                    "source": "simulated_fixture",
                    "is_simulated": True,
                }
                state["replay_reset"] = False
                _remember_frame(frame)
                await websocket.send_json(frame)
                state["index"] += 1
                if state["index"] >= len(READINGS):
                    state["status"] = "completed"
                    app.state.replay_status = "completed"
                    await websocket.send_json({
                        "type": "status",
                        "status": "completed",
                        "sequence": len(READINGS),
                        "source": "simulated_fixture",
                        "is_simulated": True,
                    })
                    continue
                if len(known_explanations) > MAX_RECENT_ALERTS:
                    oldest = next(iter(known_explanations))
                    del known_explanations[oldest]
                loop = asyncio.get_running_loop()
                next_row_at = loop.time() + playback_delay(float(state["speed"]))
                keep_open = True
                while state["status"] == "playing":
                    remaining = next_row_at - loop.time()
                    if remaining <= 0:
                        break
                    keep_open = await _command_loop(
                        websocket,
                        timeout=remaining,
                        state=state,
                        detector_ref=detector_ref,
                        known_explanations=known_explanations,
                    )
                    if not keep_open or state["status"] != "playing":
                        break
                    if state["last_command"] == "restart":
                        break
                    if state["last_command"] == "timeout":
                        break
                    if state["last_command"] == "speed":
                        next_row_at = loop.time() + playback_delay(float(state["speed"]))
            else:
                keep_open = await _command_loop(
                    websocket,
                    timeout=None,
                    state=state,
                    detector_ref=detector_ref,
                    known_explanations=known_explanations,
                )
            if not keep_open:
                break
    except WebSocketDisconnect:
        pass
    finally:
        async with app.state.connection_lock:
            app.state.connection_count = max(0, app.state.connection_count - 1)
            if app.state.connection_count == 0:
                app.state.replay_status = "disconnected"
