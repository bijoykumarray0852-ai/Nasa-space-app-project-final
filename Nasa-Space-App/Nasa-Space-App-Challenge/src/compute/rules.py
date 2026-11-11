from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import isfinite
from statistics import mean, stdev
from typing import Any, Mapping, Sequence

SIGNALS = {
    "heart_rate": {"label": "Heart rate", "unit": "bpm", "minimum": 20, "maximum": 250},
    "hrv": {"label": "Heart rate variability (RMSSD)", "unit": "ms", "minimum": 0, "maximum": 500},
    "spo2": {"label": "Peripheral oxygen saturation", "unit": "%", "minimum": 0, "maximum": 100},
    "sleep_hours": {"label": "Sleep duration", "unit": "h", "minimum": 0, "maximum": 24},
    "core_temp": {"label": "Core temperature", "unit": "°C", "minimum": 25, "maximum": 45},
    "exercise_minutes": {"label": "Exercise duration", "unit": "min", "minimum": 0, "maximum": 1440},
}

BASELINE_HOURS = 30 * 24
MULTI_SIGNAL_HOURS = 48
MIN_BASELINE_READINGS = 24
ZSCORE_THRESHOLD = 2.5
HRV_BASELINE_DAYS = 30
HRV_DEVIATION_THRESHOLD_SD = 2.0
CREW_MEMBER_ID = "simulated-crew-001"


@dataclass(frozen=True)
class DetectorConfig:
    baseline_window_hours: int = BASELINE_HOURS
    minimum_baseline_readings: int = MIN_BASELINE_READINGS
    hrv_baseline_days: int = HRV_BASELINE_DAYS
    zscore_threshold: float = ZSCORE_THRESHOLD
    hrv_threshold_sd: float = HRV_DEVIATION_THRESHOLD_SD
    signal_thresholds: Mapping[str, float] | None = None

    def __post_init__(self) -> None:
        integer_fields = (
            self.baseline_window_hours,
            self.minimum_baseline_readings,
            self.hrv_baseline_days,
        )
        if any(type(value) is not int or value <= 0 for value in integer_fields):
            raise ValueError("Detector window and sample-count settings must be positive integers.")
        if self.minimum_baseline_readings < 2 or self.hrv_baseline_days < 2:
            raise ValueError("Baseline minimums must be at least 2 for sample standard deviation.")
        if isinstance(self.zscore_threshold, bool) or not isinstance(self.zscore_threshold, (int, float)) or not isfinite(self.zscore_threshold) or self.zscore_threshold <= 0:
            raise ValueError("zscore_threshold must be a positive finite number.")
        if isinstance(self.hrv_threshold_sd, bool) or not isinstance(self.hrv_threshold_sd, (int, float)) or not isfinite(self.hrv_threshold_sd) or self.hrv_threshold_sd <= 0:
            raise ValueError("hrv_threshold_sd must be a positive finite number.")
        if self.signal_thresholds is not None:
            unknown = set(self.signal_thresholds) - (set(SIGNALS) - {"hrv"})
            if unknown:
                raise ValueError(f"Unknown signal thresholds: {', '.join(sorted(unknown))}")
            if "hrv" in self.signal_thresholds:
                raise ValueError("Configure the HRV threshold with hrv_threshold_sd.")
            if any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not isfinite(value)
                or value <= 0
                for value in self.signal_thresholds.values()
            ):
                raise ValueError("Per-signal thresholds must be positive finite numbers.")


def _window_label(hours: int) -> str:
    return f"{hours // 24}d" if hours % 24 == 0 else f"{hours}h"


def _time(value: str | datetime) -> datetime:
    if not isinstance(value, (str, datetime)):
        raise ValueError(f"Telemetry timestamp must be an ISO 8601 string or datetime: {value!r}")
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"Telemetry timestamp must include a timezone: {value}")
    return parsed.astimezone(timezone.utc)


def hrv_deviation(
    series: Sequence[float],
    baseline_days: int = HRV_BASELINE_DAYS,
    threshold_sd: float = HRV_DEVIATION_THRESHOLD_SD,
) -> dict[str, str | float | int | bool | None]:
    """Compare the latest RMSSD value with the preceding baseline_days samples."""
    if type(baseline_days) is not int or baseline_days < 2:
        raise ValueError("HRV baseline_days must be at least 2 for a sample standard deviation.")
    if isinstance(threshold_sd, bool) or not isinstance(threshold_sd, (int, float)) or not isfinite(threshold_sd) or threshold_sd <= 0:
        raise ValueError("threshold_sd must be a positive finite number.")
    if len(series) < baseline_days + 1:
        raise ValueError(f"HRV requires {baseline_days} prior baseline readings and one current reading.")

    raw_values = list(series[-(baseline_days + 1):])
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in raw_values):
        raise ValueError("HRV values must be numeric.")
    baseline = [float(value) for value in raw_values[:-1]]
    current = float(raw_values[-1])
    if not all(isfinite(value) for value in [*baseline, current]):
        raise ValueError("HRV values must be finite numbers.")
    baseline_mean = mean(baseline)
    baseline_sd = stdev(baseline)
    z_score = (current - baseline_mean) / baseline_sd if baseline_sd else None
    return {
        "rule": "hrv_below_personal_baseline",
        "rule_id": "hrv_below_personal_baseline",
        "current": current,
        "baseline_mean": baseline_mean,
        "baseline_sd": baseline_sd,
        "z": z_score,
        "fired": bool(z_score is not None and z_score <= -threshold_sd),
        "baseline_status": "ready" if baseline_sd else "degenerate_baseline",
        "window_days": baseline_days,
    }


class RollingDetector:
    """Deterministic rolling z-score rules over strictly ordered simulated readings."""

    def __init__(self, config: DetectorConfig | None = None) -> None:
        self.config = config or DetectorConfig()
        self._readings: list[dict[str, Any]] = []
        self._deviations: list[dict[str, Any]] = []
        self._multi_active = False

    def evaluate(self, reading: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(reading, dict):
            raise ValueError("A telemetry reading must be an object.")
        if "timestamp" not in reading:
            raise ValueError("Telemetry reading is missing timestamp.")
        allowed_fields = {"timestamp", "crew_member_id", "is_simulated", *SIGNALS}
        unexpected_fields = set(reading) - allowed_fields
        if unexpected_fields:
            raise ValueError(f"Unexpected telemetry fields: {', '.join(sorted(unexpected_fields))}")
        if reading.get("is_simulated", True) is not True:
            raise ValueError("This replay accepts simulated telemetry only.")
        if "crew_member_id" in reading and (
            not isinstance(reading["crew_member_id"], str)
            or not reading["crew_member_id"].strip()
            or len(reading["crew_member_id"]) > 80
        ):
            raise ValueError("crew_member_id must be a non-empty string of at most 80 characters.")

        observed_at = _time(reading["timestamp"])
        if self._readings and observed_at <= _time(self._readings[-1]["timestamp"]):
            raise ValueError("Telemetry timestamps must be strictly increasing; duplicate or out-of-order rows are rejected.")

        normalized = dict(reading)
        normalized["timestamp"] = observed_at.isoformat().replace("+00:00", "Z")
        normalized.setdefault("crew_member_id", CREW_MEMBER_ID)
        normalized["is_simulated"] = True
        for key, definition in SIGNALS.items():
            value = normalized.get(key)
            if value is None:
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"{key} must be a finite number or null.")
            if not isfinite(value) or not definition["minimum"] <= value <= definition["maximum"]:
                raise ValueError(f"{key} must be finite and between {definition['minimum']} and {definition['maximum']}.")

        baseline_start = observed_at - timedelta(hours=self.config.baseline_window_hours)
        prior = [
            item for item in self._readings
            if baseline_start <= _time(item["timestamp"]) < observed_at
        ]
        signals: dict[str, dict[str, Any]] = {}
        alerts: list[dict[str, Any]] = []
        deviating: dict[str, dict[str, Any]] = {}

        for key, definition in SIGNALS.items():
            values = [
                float(item[key]) for item in prior
                if item.get(key) is not None
            ]
            if key == "hrv":
                values = values[-self.config.hrv_baseline_days:]
            raw_value = normalized.get(key)
            value = float(raw_value) if raw_value is not None else None
            minimum_readings = (
                self.config.hrv_baseline_days
                if key == "hrv"
                else self.config.minimum_baseline_readings
            )
            baseline_mean = mean(values) if values else None
            baseline_sd = stdev(values) if len(values) >= 2 else None
            baseline_times = [
                item["timestamp"] for item in prior
                if item.get(key) is not None
            ]
            if key == "hrv":
                baseline_times = baseline_times[-self.config.hrv_baseline_days:]
            baseline_status = "ready"
            z_score: float | None = None

            if value is None:
                baseline_status = "missing_current"
            elif len(values) < minimum_readings:
                baseline_status = "insufficient_history"
            elif baseline_sd is None or baseline_sd == 0:
                baseline_status = "degenerate_baseline"
            else:
                z_score = (value - baseline_mean) / baseline_sd
                if key == "hrv":
                    hrv_result = hrv_deviation(
                        [*values, value],
                        baseline_days=self.config.hrv_baseline_days,
                        threshold_sd=self.config.hrv_threshold_sd,
                    )
                    baseline_mean = float(hrv_result["baseline_mean"])
                    baseline_sd = float(hrv_result["baseline_sd"])
                    z_score = float(hrv_result["z"]) if hrv_result["z"] is not None else None

            threshold = (
                self.config.hrv_threshold_sd
                if key == "hrv"
                else (self.config.signal_thresholds or {}).get(key, self.config.zscore_threshold)
            )
            is_deviation = (
                baseline_status == "ready"
                and z_score is not None
                and (z_score <= -threshold if key == "hrv" else abs(z_score) >= threshold)
            )
            rule_id = "hrv_below_personal_baseline" if key == "hrv" else f"{key}_outside_personal_baseline"
            rule_result = {
                "rule_id": rule_id,
                "fired": is_deviation,
                "current_value": value,
                "baseline_mean": baseline_mean,
                "baseline_sd": baseline_sd,
                "z_score": z_score,
                "threshold": threshold,
                "threshold_direction": "at_or_below_negative" if key == "hrv" else "absolute",
                "unit": definition["unit"],
                "evaluation_timestamp": normalized["timestamp"],
                "baseline_window": _window_label(self.config.baseline_window_hours),
                "baseline_start": min(baseline_times) if baseline_times else None,
                "baseline_end": max(baseline_times) if baseline_times else None,
                "sample_count": len(values),
                "data_quality_status": baseline_status,
                "is_simulated": True,
            }
            baseline = {
                "mean": baseline_mean,
                "standard_deviation": baseline_sd,
                "lower": baseline_mean - 2 * baseline_sd if baseline_mean is not None and baseline_sd is not None else None,
                "upper": baseline_mean + 2 * baseline_sd if baseline_mean is not None and baseline_sd is not None else None,
                "sample_count": len(values),
                "start": rule_result["baseline_start"],
                "end": rule_result["baseline_end"],
                "status": baseline_status,
            }
            signal_result = {
                "value": value,
                "unit": definition["unit"],
                "baseline": baseline,
                "z_score": z_score,
                "deviated": is_deviation,
                "rule_result": rule_result,
            }
            signals[key] = signal_result
            if is_deviation:
                deviating[key] = signal_result
                alerts.append(self._signal_alert(
                    key,
                    normalized,
                    signal_result,
                    threshold,
                    self.config.baseline_window_hours,
                ))

        if deviating:
            self._deviations.append({"timestamp": normalized["timestamp"], "signals": deviating})

        multi_start = observed_at - timedelta(hours=MULTI_SIGNAL_HOURS)
        recent_deviations = [
            event for event in self._deviations
            if multi_start <= _time(event["timestamp"]) <= observed_at
        ]
        latest_by_signal: dict[str, dict[str, Any]] = {}
        for event in recent_deviations:
            for key, result in event["signals"].items():
                latest_by_signal[key] = {
                    "timestamp": event["timestamp"],
                    "value": result["value"],
                    "unit": result["unit"],
                    "baseline_mean": result["baseline"]["mean"],
                    "baseline_standard_deviation": result["baseline"]["standard_deviation"],
                    "z_score": result["z_score"],
                    "rule_id": result["rule_result"]["rule_id"],
                    "threshold": result["rule_result"]["threshold"],
                    "threshold_direction": result["rule_result"]["threshold_direction"],
                    "baseline_window": result["rule_result"]["baseline_window"],
                    "baseline_start": result["rule_result"]["baseline_start"],
                    "baseline_end": result["rule_result"]["baseline_end"],
                    "sample_count": result["baseline"]["sample_count"],
                    "data_quality_status": result["baseline"]["status"],
                }

        multi_fired = len(latest_by_signal) >= 2 and not self._multi_active
        if multi_fired:
            contributing_signals = [
                {"signal": key, **latest_by_signal[key]}
                for key in sorted(latest_by_signal)
            ]
            alerts.append({
                "id": f"multi_signal_48h:{normalized['timestamp']}",
                "alert_id": f"multi_signal_48h:{normalized['timestamp']}",
                "crew_member_id": normalized["crew_member_id"],
                "rule_id": "multi_signal_48h",
                "rule": "Two or more distinct signals deviated within the same rolling 48-hour window",
                "timestamp": normalized["timestamp"],
                "severity": "watch",
                "signal": None,
                "unit": None,
                "current_value": None,
                "baseline_mean": None,
                "baseline_sd": None,
                "z_score": None,
                "threshold": None,
                "baseline_window": _window_label(MULTI_SIGNAL_HOURS),
                "sample_count": None,
                "contributing_signals": contributing_signals,
                "signals": latest_by_signal,
                "deviation_count": len(contributing_signals),
                "data_quality_status": "ready",
                "is_simulated": True,
            })
        self._multi_active = len(latest_by_signal) >= 2
        self._readings.append(normalized)
        self._deviations = [
            event for event in self._deviations
            if _time(event["timestamp"]) >= multi_start
        ]

        if alerts:
            summaries = []
            for alert in alerts:
                if alert.get("signal") is not None:
                    threshold_text = (
                        f"z <= -{alert['threshold']:.1f}"
                        if alert["threshold_direction"] == "at_or_below_negative"
                        else f"|z| >= {alert['threshold']:.1f}"
                    )
                    summaries.append(
                        f"{alert['label']} was {alert['current_value']:g} {alert['unit']} at {alert['timestamp']}, "
                        f"compared with its preceding {alert['baseline_window']} personal baseline mean of "
                        f"{alert['baseline_mean']:.2f} {alert['unit']} "
                        f"(sample SD {alert['baseline_sd']:.2f}, n={alert['sample_count']}; "
                        f"z={alert['z_score']:.2f}). Rule {alert['rule_id']} fired at {threshold_text}."
                    )
                else:
                    contributors = "; ".join(
                        f"{SIGNALS[item['signal']]['label']} was {item['value']:g} {item['unit']} at "
                        f"{item['timestamp']} against baseline mean {item['baseline_mean']:.2f} "
                        f"(SD {item['baseline_standard_deviation']:.2f}, n={item['sample_count']}, "
                        f"z={item['z_score']:.2f}, threshold {item['threshold']:.1f} SD, "
                        f"rule {item['rule_id']})"
                        for item in alert["contributing_signals"]
                    )
                    summaries.append(
                        f"At {alert['timestamp']}, {alert['deviation_count']} distinct signals deviated "
                        f"within the rolling {alert['baseline_window']} window under rule "
                        f"{alert['rule_id']}: {contributors}."
                    )
            summary = " ".join(summaries) + " These are statistical deviations in simulated data, not a medical assessment."
        elif any(item["baseline"]["status"] == "insufficient_history" for item in signals.values()):
            summary = "Building personal baselines from simulated readings; insufficient historical observations prevent some rule evaluations."
        elif any(item["baseline"]["status"] == "missing_current" for item in signals.values()):
            summary = f"At {normalized['timestamp']}, one or more simulated signal values are missing; those rules were not evaluated."
        elif any(item["baseline"]["status"] == "degenerate_baseline" for item in signals.values()):
            summary = (
                f"At {normalized['timestamp']}, no configured deviation rule fired for eligible signals. "
                "One or more baselines have zero variation, so those rules were not evaluated."
            )
        else:
            summary = f"At {normalized['timestamp']}, no configured deviation rule fired for this observation. This is not a medical assessment."

        return {
            "reading": normalized,
            "signals": signals,
            "alerts": alerts,
            "summary": summary,
            "baseline_window_hours": self.config.baseline_window_hours,
            "minimum_baseline_readings": self.config.minimum_baseline_readings,
            "hrv_baseline_days": self.config.hrv_baseline_days,
            "hrv_threshold_sd": self.config.hrv_threshold_sd,
            "source": "simulated_fixture",
            "is_simulated": True,
        }

    @staticmethod
    def _signal_alert(
        key: str,
        reading: dict[str, Any],
        result: dict[str, Any],
        threshold: float,
        baseline_window_hours: int,
    ) -> dict[str, Any]:
        definition = SIGNALS[key]
        baseline = result["baseline"]
        rule_result = result["rule_result"]
        z_score = rule_result["z_score"]
        rule_id = rule_result["rule_id"]
        rule = (
            f"HRV falls at least {threshold:g} sample SD below the preceding "
            f"{baseline_window_hours / 24:g}-day personal baseline"
            if key == "hrv"
            else f"{definition['label']} falls outside the configured personal-baseline z-score threshold"
        )
        alert_id = f"{rule_id}:{reading['timestamp']}"
        return {
            "id": alert_id,
            "alert_id": alert_id,
            "crew_member_id": reading["crew_member_id"],
            "rule_id": rule_id,
            "rule": rule,
            "timestamp": reading["timestamp"],
            "severity": "watch",
            "signal": key,
            "label": definition["label"],
            "value": result["value"],
            "current_value": result["value"],
            "unit": definition["unit"],
            "baseline_mean": baseline["mean"],
            "baseline_standard_deviation": baseline["standard_deviation"],
            "baseline_sd": baseline["standard_deviation"],
            "baseline_sample_count": baseline["sample_count"],
            "sample_count": baseline["sample_count"],
            "baseline_start": baseline["start"],
            "baseline_end": baseline["end"],
            "z_score": z_score,
            "threshold": threshold,
            "threshold_direction": "at_or_below_negative" if key == "hrv" else "absolute",
            "direction": "below" if key == "hrv" or z_score < 0 else "above",
            "baseline_window": _window_label(baseline_window_hours),
            "baseline_window_hours": baseline_window_hours,
            "window_days": baseline_window_hours / 24,
            "contributing_signals": [],
            "data_quality_status": baseline["status"],
            "is_simulated": True,
        }
