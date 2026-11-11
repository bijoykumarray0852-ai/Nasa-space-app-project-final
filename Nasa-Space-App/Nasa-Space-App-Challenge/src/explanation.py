from __future__ import annotations

import re
from typing import Any

from src.compute.schemas import Alert, ExplanationResponse

SYSTEM_PROMPT = """You are a scientific evidence explanation component for a simulated crew-health monitoring demonstration.
Your sole task is to explain an already-computed deterministic alert using only the supplied validated alert object
and supplied cached research metadata. Do not diagnose disease, infer a medical condition, recommend treatment,
prescribe medication, or provide clinical instructions. Do not change detection decisions or recalculate thresholds.
Report the measured deviation, timestamp, supplied personal-baseline statistics, and exact rule that fired. Cite a
study only when its identifier and canonical URL are present in the supplied metadata. Distinguish the study's
documented evidence from this application's engineering interpretation. Do not claim causation, validation, or
findings beyond the supplied metadata. If evidence is missing, say so. Telemetry is simulated, never actual astronaut
or patient data. Return only the requested structured explanation."""

MAX_EXPLANATION_LENGTH = 3000
FALLBACK_TEXT = (
    "A deterministic statistical rule flagged the simulated observation. "
    "Its measurements, timestamp, and baseline comparison are available above. "
    "No automated medical interpretation is provided."
)

FORBIDDEN_CLAIMS = (
    re.compile(r"\bdiagnos(?:e|ed|es|ing|is|tic|tics)\b", re.IGNORECASE),
    re.compile(r"\b(?:disease|syndrome|disorder|illness|pathology|medical condition|symptom)\b", re.IGNORECASE),
    re.compile(r"\b(?:treat(?:ment|s|ed|ing)?|medicat(?:e|ed|ion|ions)|prescrib(?:e|es|ed|ing)|therapy)\b", re.IGNORECASE),
    re.compile(r"\b(?:should|must|need to|recommend(?:s|ed|ation)?|seek (?:medical )?care|consult (?:a|your) (?:doctor|physician|clinician))\b", re.IGNORECASE),
    re.compile(r"\b(?:suggests?|indicates?|indicative of|consistent with|points? to|raises? concern for|sign of|likely has|may have|could have|is likely to have)\b", re.IGNORECASE),
    re.compile(r"\b(?:caused by|causes?|results? from|due to|as a result of|led to)\b", re.IGNORECASE),
    re.compile(r"\b(?:study|paper|research)\b.{0,80}\b(?:proves?|demonstrates?|shows?|finds?|found|concludes?)\b", re.IGNORECASE),
    re.compile(r"\b(?:normal|healthy|medically safe|at risk|risk of)\b", re.IGNORECASE),
    re.compile(r"\b(?:take|stop|start|increase|decrease|reduce|avoid)\s+(?:your\s+)?(?:medication|dose|exercise|activity|treatment|drug)\b", re.IGNORECASE),
    re.compile(r"\b(?:visit|contact|reach out to)\s+(?:a|your)\s+(?:doctor|clinician|medical team)\b", re.IGNORECASE),
    re.compile(r"\b(?:continue|begin|start|keep)\s+(?:to\s+)?(?:monitor|monitoring|follow up|follow-up)\b", re.IGNORECASE),
)
URL_PATTERN = re.compile(r"https?://[^\s)>\]]+", re.IGNORECASE)
STUDY_ID_PATTERN = re.compile(r"\b(?:OSD-\d+|GLDS-\d+|NASA NTRS \d{8,})\b", re.IGNORECASE)


def post_check(text: str) -> bool:
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_EXPLANATION_LENGTH:
        return False
    return not any(pattern.search(text) for pattern in FORBIDDEN_CLAIMS)


def _number(value: Any, digits: int = 2) -> str:
    return f"{float(value):.{digits}f}"


def _alert_numbers(alert: dict[str, Any]) -> list[str]:
    values = [
        alert.get("timestamp"),
        alert.get("rule_id"),
        alert.get("rule"),
    ]
    if alert.get("signal") is not None:
        values.extend([
            f"{float(alert.get('current_value', alert.get('value'))):g}",
            _number(alert.get("baseline_mean")),
            _number(alert.get("baseline_sd", alert.get("baseline_standard_deviation"))),
            _number(alert.get("z_score")),
            alert.get("unit"),
            _number(alert.get("threshold"), 1),
        ])
    else:
        for item in alert.get("contributing_signals", []):
            values.extend([
                item.get("timestamp"),
                f"{float(item['value']):g}",
                _number(item["baseline_mean"]),
                _number(item["baseline_standard_deviation"]),
                _number(item["z_score"]),
                item.get("unit"),
                item.get("rule_id"),
                _number(item["threshold"], 1),
            ])
    return [value for value in values if isinstance(value, str) and value]


def validate_model_explanation(
    alert_data: dict[str, Any],
    studies: list[dict[str, Any]],
    text: str,
) -> bool:
    if not post_check(text) or "simulated" not in text.casefold():
        return False
    if not all(token in text for token in _alert_numbers(alert_data)):
        return False

    allowed_urls = {str(study["canonical_url"]) for study in studies}
    allowed_ids = {study["study_id"] for study in studies}
    found_urls = {
        match.rstrip(".,;:") for match in URL_PATTERN.findall(text)
    }
    found_ids = set(STUDY_ID_PATTERN.findall(text))
    if not found_urls.issubset(allowed_urls) or not found_ids.issubset(allowed_ids):
        return False
    if studies:
        return (
            all(study_id in text for study_id in allowed_ids)
            and all(url in text for url in allowed_urls)
            and "research context only" in text.casefold()
            and "not evidence about this observation" in text.casefold()
        )
    return not found_ids and not found_urls and "no verified research metadata" in text.casefold()


def explain_alert(
    alert_data: dict[str, Any],
    studies: list[dict[str, Any]],
) -> dict[str, Any]:
    alert = Alert.model_validate(alert_data).model_dump(mode="json")
    study = studies[0] if studies else None
    if alert["rule_id"] == "multi_signal_48h":
        descriptions = [
            (
                f"{item['signal'].replace('_', ' ')} was {item['value']:g} {item['unit']} "
                f"at {item['timestamp']} against a baseline mean of {item['baseline_mean']:.2f} "
                f"(sample SD {item['baseline_standard_deviation']:.2f}, n={item['sample_count']}, "
                f"z={item['z_score']:.2f}, threshold {item['threshold']:.1f}; "
                f"rule {item['rule_id']})"
            )
            for item in alert["contributing_signals"]
        ]
        observed = "; ".join(descriptions)
        rule_explanation = (
            f"{alert['deviation_count']} distinct eligible signals deviated within the rolling "
            f"{alert['baseline_window']} window; this rule counts coincident deviations only."
        )
        summary = f"At {alert['timestamp']}, {observed}. Rule {alert['rule_id']} fired."
    else:
        value = alert["current_value"]
        baseline_mean = alert["baseline_mean"]
        baseline_sd = alert["baseline_sd"]
        observed = (
            f"{alert['signal']} was {value:g} {alert['unit']} at {alert['timestamp']}; "
            f"the prior {alert['baseline_window']} baseline mean was {baseline_mean:.2f} "
            f"{alert['unit']} (sample SD {baseline_sd:.2f}, n={alert['sample_count']}, "
            f"z={alert['z_score']:.2f})."
        )
        if alert["threshold_direction"] == "at_or_below_negative":
            threshold_text = f"z <= -{alert['threshold']:.1f}"
        else:
            threshold_text = f"|z| >= {alert['threshold']:.1f}"
        rule_explanation = f"Rule {alert['rule_id']} fired at its configured engineering threshold {threshold_text}."
        summary = f"{observed} {rule_explanation}"

    limitation = (
        "The telemetry is simulated. The cited source is research context only, "
        "not evidence about this observation or a personal threshold."
        if study
        else "The telemetry is simulated. No verified research metadata is available for this alert."
    )
    text = (
        f"{summary} This is a statistical observation from simulated telemetry. "
        f"{limitation}"
    )
    if study:
        text += f" Research context only: {study['study_id']} {study['title']} {study['canonical_url']}."

    if not post_check(text):
        raise ValueError("Explanation blocked by deterministic safety checks.")
    explanation = ExplanationResponse(
        alert_id=alert["alert_id"],
        plain_language_summary=summary,
        observed_deviation=observed,
        rule_explanation=rule_explanation,
        evidence_status=study["verification_status"] if study else "unavailable",
        study_id=study["study_id"] if study else None,
        study_title=study["title"] if study else None,
        study_url=study["canonical_url"] if study else None,
        evidence_limitations=limitation,
        is_simulated=True,
        diagnosis_provided=False,
        treatment_recommended=False,
    )
    return {
        **explanation.model_dump(mode="json"),
        "text": text,
        "sources": [study] if study else [],
    }
