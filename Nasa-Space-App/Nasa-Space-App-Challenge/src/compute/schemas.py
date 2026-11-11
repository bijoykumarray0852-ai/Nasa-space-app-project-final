from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, HttpUrl, field_validator, model_validator

from src.compute.rules import SIGNALS


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timestamp values must include a UTC offset")
    return value.astimezone(timezone.utc)


class TelemetryReading(StrictModel):
    timestamp: datetime
    crew_member_id: str = Field(default="simulated-crew-001", min_length=1, max_length=80)
    heart_rate: FiniteFloat | None = Field(default=None, ge=20, le=250)
    hrv: FiniteFloat | None = Field(default=None, ge=0, le=500)
    spo2: FiniteFloat | None = Field(default=None, ge=0, le=100)
    sleep_hours: FiniteFloat | None = Field(default=None, ge=0, le=24)
    core_temp: FiniteFloat | None = Field(default=None, ge=25, le=45)
    exercise_minutes: FiniteFloat | None = Field(default=None, ge=0, le=1440)
    is_simulated: Literal[True] = True

    @field_validator("heart_rate", "hrv", "spo2", "sleep_hours", "core_temp", "exercise_minutes", mode="before")
    @classmethod
    def reject_boolean_and_string_measurements(cls, value: object) -> object:
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))):
            raise ValueError("signal values must be JSON numbers or null")
        return value

    @field_validator("timestamp")
    @classmethod
    def require_timezone_and_normalize_utc(cls, value: datetime) -> datetime:
        return _utc_datetime(value)


class BaselineStats(StrictModel):
    mean: FiniteFloat | None
    standard_deviation: FiniteFloat | None
    lower: FiniteFloat | None
    upper: FiniteFloat | None
    sample_count: int = Field(ge=0)
    start: datetime | None
    end: datetime | None
    status: Literal["ready", "insufficient_history", "degenerate_baseline", "missing_current"]

    @field_validator("start", "end")
    @classmethod
    def normalize_observed_timestamps(cls, value: datetime | None) -> datetime | None:
        return _utc_datetime(value) if value is not None else None


class RuleEvaluation(StrictModel):
    rule_id: str = Field(min_length=1, max_length=100)
    fired: bool
    current_value: FiniteFloat | None
    baseline_mean: FiniteFloat | None
    baseline_sd: FiniteFloat | None
    z_score: FiniteFloat | None
    threshold: FiniteFloat = Field(gt=0)
    threshold_direction: Literal["absolute", "at_or_below_negative"]
    unit: str
    evaluation_timestamp: datetime
    baseline_window: str
    baseline_start: datetime | None
    baseline_end: datetime | None
    sample_count: int = Field(ge=0)
    data_quality_status: Literal["ready", "insufficient_history", "degenerate_baseline", "missing_current"]
    is_simulated: Literal[True]

    @field_validator("evaluation_timestamp", "baseline_start", "baseline_end")
    @classmethod
    def normalize_evaluation_timestamps(cls, value: datetime | None) -> datetime | None:
        return _utc_datetime(value) if value is not None else None


class SignalState(StrictModel):
    value: FiniteFloat | None
    unit: str
    baseline: BaselineStats
    z_score: FiniteFloat | None
    deviated: bool
    rule_result: RuleEvaluation


class ContributingSignal(StrictModel):
    signal: str
    timestamp: datetime
    value: FiniteFloat
    unit: str
    baseline_mean: FiniteFloat
    baseline_standard_deviation: FiniteFloat
    z_score: FiniteFloat
    rule_id: str
    threshold: FiniteFloat = Field(gt=0)
    threshold_direction: Literal["absolute", "at_or_below_negative"]
    baseline_window: str
    baseline_start: datetime
    baseline_end: datetime
    sample_count: int = Field(ge=0)
    data_quality_status: Literal["ready"]

    @field_validator("timestamp", "baseline_start", "baseline_end")
    @classmethod
    def normalize_contributor_timestamps(cls, value: datetime) -> datetime:
        return _utc_datetime(value)


class Alert(StrictModel):
    alert_id: str = Field(min_length=1, max_length=200)
    id: str | None = Field(default=None, max_length=200)
    crew_member_id: str = Field(min_length=1, max_length=80)
    timestamp: datetime
    rule_id: str = Field(min_length=1, max_length=100)
    rule: str = Field(min_length=1, max_length=250)
    severity: Literal["watch", "informational"]
    signal: str | None
    label: str | None = None
    unit: str | None
    current_value: FiniteFloat | None
    value: FiniteFloat | None = None
    baseline_mean: FiniteFloat | None
    baseline_sd: FiniteFloat | None
    baseline_standard_deviation: FiniteFloat | None = None
    z_score: FiniteFloat | None
    threshold: FiniteFloat | None
    threshold_direction: Literal["absolute", "at_or_below_negative"] | None = None
    direction: Literal["above", "below"] | None = None
    baseline_window: str
    baseline_window_hours: int | None = Field(default=None, gt=0)
    window_days: FiniteFloat | None = Field(default=None, gt=0)
    sample_count: int | None = Field(ge=0)
    baseline_sample_count: int | None = Field(default=None, ge=0)
    baseline_start: datetime | None = None
    baseline_end: datetime | None = None
    contributing_signals: list[ContributingSignal]
    signals: dict[str, dict[str, str | float | int]] | None = None
    deviation_count: int | None = Field(default=None, ge=2)
    data_quality_status: Literal["ready", "insufficient_history", "degenerate_baseline", "missing_current"]
    is_simulated: Literal[True]

    @field_validator("timestamp", "baseline_start", "baseline_end")
    @classmethod
    def normalize_alert_timestamps(cls, value: datetime | None) -> datetime | None:
        return _utc_datetime(value) if value is not None else None

    @model_validator(mode="after")
    def validate_alert_shape(self) -> Alert:
        if self.rule_id == "multi_signal_48h":
            signals = [item.signal for item in self.contributing_signals]
            if self.signal is not None or len(signals) < 2 or len(set(signals)) != len(signals):
                raise ValueError("multi-signal alerts require at least two contributors and no single signal")
            if self.deviation_count != len(signals) or any(item.data_quality_status != "ready" for item in self.contributing_signals):
                raise ValueError("multi-signal alert contributor count and data quality must be valid")
        else:
            if self.signal not in SIGNALS or self.current_value is None or self.z_score is None:
                raise ValueError("signal alerts require a known signal, current value, and z-score")
            if (
                self.data_quality_status != "ready"
                or self.baseline_mean is None
                or self.baseline_sd is None
                or self.baseline_sd <= 0
                or self.threshold is None
                or self.sample_count is None
            ):
                raise ValueError("signal alerts require a ready, non-degenerate baseline and exact threshold values")
        if self.id is not None and self.id != self.alert_id:
            raise ValueError("id compatibility field must match alert_id")
        return self


class ExplanationResponse(StrictModel):
    alert_id: str
    plain_language_summary: str = Field(min_length=1, max_length=1000)
    observed_deviation: str = Field(min_length=1, max_length=500)
    rule_explanation: str = Field(min_length=1, max_length=500)
    evidence_status: Literal["verified", "cached_unverified", "unavailable"]
    study_id: str | None = None
    study_title: str | None = None
    study_url: HttpUrl | None = None
    evidence_limitations: str = Field(min_length=1, max_length=1000)
    is_simulated: Literal[True]
    diagnosis_provided: Literal[False]
    treatment_recommended: Literal[False]


class ResearchMetadata(StrictModel):
    study_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=300)
    source: Literal["OSDR", "GeneLab", "NTRS"]
    canonical_url: HttpUrl
    publication_date: str | None = None
    retrieved_at: datetime | None = None
    relevance_notes: str = Field(min_length=1, max_length=1000)
    verification_status: Literal["verified", "unverified", "unavailable"]
    evidence_summary: str | None = Field(default=None, max_length=1000)

    @field_validator("retrieved_at")
    @classmethod
    def normalize_retrieval_timestamp(cls, value: datetime | None) -> datetime | None:
        return _utc_datetime(value) if value is not None else None


class ReplayCommand(StrictModel):
    type: Literal["speed", "pause", "resume", "restart", "explanation_result"]
    value: FiniteFloat | None = None
    alert_id: str | None = Field(default=None, max_length=200)
    text: str | None = Field(default=None, max_length=3000)

    @field_validator("value", mode="before")
    @classmethod
    def reject_boolean_speed(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("speed must be numeric, not boolean")
        return value

    @model_validator(mode="after")
    def validate_command_fields(self) -> ReplayCommand:
        if self.type == "speed" and (self.value is None or not 0.25 <= self.value <= 10):
            raise ValueError("speed must be between 0.25 and 10")
        if self.type == "explanation_result" and (not self.alert_id or self.text is None):
            raise ValueError("explanation_result requires alert_id and text")
        if self.type not in {"speed", "explanation_result"} and (self.value is not None or self.alert_id is not None or self.text is not None):
            raise ValueError(f"{self.type} does not accept additional fields")
        return self


class ErrorResponse(StrictModel):
    error: str
    message: str
