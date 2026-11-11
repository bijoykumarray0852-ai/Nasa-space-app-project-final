import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import mean, stdev

import pytest

from src.compute import DetectorConfig, RollingDetector, SIGNALS, hrv_deviation
from src.compute.schemas import Alert, TelemetryReading

ROOT = Path(__file__).resolve().parents[1]


def load_fixture(name: str) -> list[dict]:
    with (ROOT / "tests" / "fixtures" / name).open(encoding="utf-8") as fixture:
        return json.load(fixture)


def run_readings(readings: list[dict]) -> list[dict]:
    detector = RollingDetector()
    return [
        alert
        for reading in readings
        for alert in detector.evaluate(reading)["alerts"]
    ]


def run_fixture(name: str) -> list[dict]:
    readings = load_fixture(name)
    if name == "vitals_anomaly.json":
        readings = load_fixture("vitals_clean.json") + readings
    return run_readings(readings)


def at_time(day: int, **overrides: float) -> dict:
    reading = dict(load_fixture("vitals_clean.json")[-1])
    reading["timestamp"] = (datetime(2026, 3, 1, tzinfo=timezone.utc) + timedelta(days=day)).isoformat().replace("+00:00", "Z")
    reading.update(overrides)
    return reading


def test_each_signal_rule_fires_on_planted_anomaly_and_not_clean_fixture() -> None:
    anomaly_alerts = run_fixture("vitals_anomaly.json")
    clean_alerts = run_fixture("vitals_clean.json")
    fired_rule_ids = {alert["rule_id"] for alert in anomaly_alerts}

    for signal in SIGNALS:
        expected_rule = "hrv_below_personal_baseline" if signal == "hrv" else f"{signal}_outside_personal_baseline"
        assert expected_rule in fired_rule_ids
        assert expected_rule not in {alert["rule_id"] for alert in clean_alerts}


def test_demo_fixture_hrv_alert_uses_30_prior_readings_and_exact_threshold() -> None:
    alerts = run_readings(json.loads((ROOT / "demo_fixtures" / "vitals.json").read_text(encoding="utf-8")))
    signal_alerts = [alert for alert in alerts if alert.get("signal") == "hrv"]

    assert len(signal_alerts) == 1
    alert = signal_alerts[0]
    assert alert["rule_id"] == "hrv_below_personal_baseline"
    assert alert["timestamp"] == "2026-03-31T00:00:00Z"
    assert alert["baseline_window"] == "30d"
    assert alert["direction"] == "below"
    assert alert["current_value"] == 26.0
    assert alert["sample_count"] == 30
    assert alert["threshold"] == 2.0
    assert alert["z_score"] <= -2.0
    assert alert["is_simulated"] is True


def test_hrv_rule_is_one_sided_and_uses_sample_standard_deviation() -> None:
    baseline = [48.0, 52.0] * 15
    result = hrv_deviation([*baseline, 40.0])

    assert result["rule"] == "hrv_below_personal_baseline"
    assert result["baseline_mean"] == 50
    assert result["baseline_sd"] == stdev(baseline)
    assert result["z"] == (40 - mean(baseline)) / stdev(baseline)
    assert result["baseline_status"] == "ready"
    assert result["fired"] is True
    assert hrv_deviation([*baseline, 80.0])["fired"] is False
    degenerate = hrv_deviation([50.0] * 30 + [40.0])
    assert degenerate["fired"] is False
    assert degenerate["z"] is None
    assert degenerate["baseline_status"] == "degenerate_baseline"


def test_multi_signal_rule_fires_for_two_distinct_signals_inside_inclusive_48_hours() -> None:
    clean = load_fixture("vitals_clean.json")
    heart_rate = at_time(30, heart_rate=112)
    one_day_later = at_time(31)
    hrv = at_time(32, hrv=23)

    alerts = run_readings(clean + [heart_rate, one_day_later, hrv])
    multi_alerts = [alert for alert in alerts if alert["rule_id"] == "multi_signal_48h"]

    assert len(multi_alerts) == 1
    assert multi_alerts[0]["deviation_count"] == 2
    assert {item["signal"] for item in multi_alerts[0]["contributing_signals"]} == {"heart_rate", "hrv"}
    assert {item["rule_id"] for item in multi_alerts[0]["contributing_signals"]} == {
        "heart_rate_outside_personal_baseline",
        "hrv_below_personal_baseline",
    }


def test_multi_signal_rule_does_not_count_repeated_deviation_of_one_signal() -> None:
    clean = load_fixture("vitals_clean.json")
    alerts = run_readings(clean + [
        at_time(30, heart_rate=112),
        at_time(31, heart_rate=113),
        at_time(32, heart_rate=114),
    ])
    assert not any(alert["rule_id"] == "multi_signal_48h" for alert in alerts)


def test_multi_signal_rule_excludes_deviations_more_than_48_hours_apart() -> None:
    clean = load_fixture("vitals_clean.json")
    alerts = run_readings(clean + [
        at_time(30, heart_rate=112),
        at_time(31),
        at_time(32),
        at_time(33, hrv=23),
    ])
    assert not any(alert["rule_id"] == "multi_signal_48h" for alert in alerts)


def test_baseline_excludes_current_observation_and_future_values() -> None:
    clean = load_fixture("vitals_clean.json")
    detector = RollingDetector()
    for reading in clean[:-1]:
        detector.evaluate(reading)
    current = detector.evaluate(clean[-1])
    observed = current["signals"]["hrv"]["baseline"]

    assert observed["sample_count"] == len(clean) - 1
    assert observed["mean"] == mean(item["hrv"] for item in clean[:-1])
    assert observed["end"] == clean[-2]["timestamp"]


def test_insufficient_history_is_explicit_and_never_reported_as_normal() -> None:
    detector = RollingDetector()
    frame = detector.evaluate(load_fixture("vitals_clean.json")[0])
    for signal in SIGNALS:
        assert frame["signals"][signal]["baseline"]["status"] == "insufficient_history"
        assert frame["signals"][signal]["rule_result"]["fired"] is False
        assert frame["signals"][signal]["baseline"]["mean"] is None
    assert "Building personal baselines" in frame["summary"]


def test_zero_standard_deviation_is_degenerate_and_does_not_fire() -> None:
    detector = RollingDetector()
    base = load_fixture("vitals_clean.json")[0]
    stable = []
    constants = {
        "heart_rate": 70.0,
        "hrv": 50.0,
        "spo2": 98.0,
        "sleep_hours": 7.0,
        "core_temp": 36.5,
        "exercise_minutes": 30.0,
    }
    for day in range(30):
        reading = dict(base)
        reading["timestamp"] = (datetime(2026, 3, 1, tzinfo=timezone.utc) + timedelta(days=day)).isoformat().replace("+00:00", "Z")
        reading.update(constants)
        stable.append(reading)
    for reading in stable:
        detector.evaluate(reading)
    current = dict(stable[-1])
    current["timestamp"] = "2026-03-31T00:00:00Z"
    current["hrv"] = 20
    frame = detector.evaluate(current)
    assert frame["signals"]["hrv"]["baseline"]["status"] == "degenerate_baseline"
    assert frame["signals"]["hrv"]["z_score"] is None
    assert frame["signals"]["hrv"]["deviated"] is False


def test_missing_current_value_skips_that_rule_and_preserves_data_quality_state() -> None:
    clean = load_fixture("vitals_clean.json")
    detector = RollingDetector()
    for reading in clean:
        detector.evaluate(reading)
    missing = at_time(30)
    missing["heart_rate"] = None
    frame = detector.evaluate(missing)
    assert frame["signals"]["heart_rate"]["baseline"]["status"] == "missing_current"
    assert frame["signals"]["heart_rate"]["rule_result"]["fired"] is False
    assert not any(alert["signal"] == "heart_rate" for alert in frame["alerts"])


def test_invalid_nonfinite_and_out_of_range_values_are_rejected() -> None:
    detector = RollingDetector()
    reading = dict(load_fixture("vitals_clean.json")[0])
    reading["heart_rate"] = float("nan")
    with pytest.raises(ValueError, match="finite"):
        detector.evaluate(reading)
    reading["heart_rate"] = 251
    with pytest.raises(ValueError, match="between"):
        detector.evaluate(reading)


def test_duplicate_and_out_of_order_timestamps_are_rejected() -> None:
    detector = RollingDetector()
    clean = load_fixture("vitals_clean.json")
    detector.evaluate(clean[0])
    with pytest.raises(ValueError, match="strictly increasing"):
        detector.evaluate(clean[0])
    with pytest.raises(ValueError, match="strictly increasing"):
        detector.evaluate(dict(clean[0], timestamp="2026-02-28T00:00:00Z"))


def test_irregular_sampling_uses_actual_valid_observation_count() -> None:
    clean = load_fixture("vitals_clean.json")
    detector = RollingDetector()
    for index, original in enumerate(clean):
        reading = dict(original)
        irregular_day = index + (index // 4) * 0.1
        reading["timestamp"] = (datetime(2026, 3, 1, tzinfo=timezone.utc) + timedelta(days=irregular_day)).isoformat().replace("+00:00", "Z")
        detector.evaluate(reading)
    current = dict(clean[-1])
    current["timestamp"] = "2026-03-31T00:00:00Z"
    frame = detector.evaluate(current)
    assert frame["signals"]["hrv"]["baseline"]["sample_count"] == 30
    assert frame["signals"]["hrv"]["baseline"]["status"] == "ready"


def test_same_input_is_deterministic() -> None:
    readings = load_fixture("vitals_clean.json") + load_fixture("vitals_anomaly.json")
    assert run_readings(readings) == run_readings(readings)


def test_alert_and_telemetry_schemas_validate_contracts() -> None:
    alert = run_fixture("vitals_anomaly.json")[0]
    parsed = Alert.model_validate(alert)
    assert parsed.is_simulated is True
    assert parsed.alert_id == alert["alert_id"]
    with pytest.raises(Exception):
        Alert.model_validate({**alert, "z_score": float("nan")})
    reading = TelemetryReading.model_validate(load_fixture("vitals_clean.json")[0])
    assert reading.is_simulated is True


def test_hrv_helper_validates_sample_count_and_threshold() -> None:
    with pytest.raises(ValueError, match="prior baseline readings"):
        hrv_deviation([1, 2, 3])
    with pytest.raises(ValueError, match="positive finite"):
        hrv_deviation([*([1.0, 2.0] * 15), 0.5], threshold_sd=float("inf"))


def test_detector_thresholds_and_sample_minimums_are_configurable() -> None:
    config = DetectorConfig(
        minimum_baseline_readings=2,
        hrv_baseline_days=2,
        zscore_threshold=3.0,
        hrv_threshold_sd=2.0,
        signal_thresholds={"heart_rate": 2.0},
    )
    detector = RollingDetector(config)
    rows = [
        at_time(0, heart_rate=70, hrv=49),
        at_time(1, heart_rate=72, hrv=52),
        at_time(2, heart_rate=74, hrv=40),
    ]
    for row in rows[:-1]:
        detector.evaluate(row)
    result = detector.evaluate(rows[-1])

    assert result["signals"]["heart_rate"]["rule_result"]["threshold"] == 2.0
    assert result["signals"]["heart_rate"]["rule_result"]["fired"] is True
    assert result["signals"]["hrv"]["baseline"]["sample_count"] == 2
    assert result["signals"]["hrv"]["rule_result"]["fired"] is True
    assert result["minimum_baseline_readings"] == 2
