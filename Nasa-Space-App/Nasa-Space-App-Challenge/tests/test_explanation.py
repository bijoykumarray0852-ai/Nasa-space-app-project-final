import json
from pathlib import Path

from src.compute import RollingDetector
from src.explanation import explain_alert, post_check, validate_model_explanation
from src.research import load_research_cache, studies_for_signal

ROOT = Path(__file__).resolve().parents[1]


def hrv_alert() -> dict:
    detector = RollingDetector()
    alerts = []
    with (ROOT / "demo_fixtures" / "vitals.json").open(encoding="utf-8") as fixture:
        for reading in json.load(fixture):
            alerts.extend(detector.evaluate(reading)["alerts"])
    return next(alert for alert in alerts if alert.get("signal") == "hrv")


def research_records() -> list[dict]:
    return load_research_cache(ROOT / "demo_fixtures" / "research_metadata.json")


def test_explanation_is_structured_simulated_and_cites_only_verified_source() -> None:
    alert = hrv_alert()
    studies = studies_for_signal("hrv", research_records())
    explanation = explain_alert(alert, studies)

    assert explanation["alert_id"] == alert["alert_id"]
    assert explanation["is_simulated"] is True
    assert explanation["diagnosis_provided"] is False
    assert explanation["treatment_recommended"] is False
    assert explanation["evidence_status"] == "verified"
    assert "26 ms" in explanation["plain_language_summary"]
    assert "2026-03-31T00:00:00Z" in explanation["text"]
    assert "hrv_below_personal_baseline" in explanation["text"]
    assert "NASA NTRS 20040087874" in explanation["text"]
    assert "https://ntrs.nasa.gov/citations/20040087874" in explanation["text"]
    assert post_check(explanation["text"])
    assert validate_model_explanation(alert, studies, explanation["text"])


def test_no_evidence_explanation_is_useful_and_does_not_invent_a_citation() -> None:
    alert = hrv_alert()
    explanation = explain_alert(alert, [])
    assert explanation["evidence_status"] == "unavailable"
    assert explanation["study_id"] is None
    assert explanation["sources"] == []
    assert "No verified research metadata" in explanation["text"]
    assert validate_model_explanation(alert, [], explanation["text"])


def test_post_check_blocks_explicit_and_indirect_diagnostic_claims() -> None:
    unsafe = [
        "This reading is a diagnosis.",
        "The crew member likely has a cardiac condition.",
        "This pattern is consistent with disease.",
        "The deviation indicates an underlying condition.",
        "The result suggests that the crew member has an illness.",
        "The study proves this alert is medically meaningful.",
    ]
    assert all(not post_check(text) for text in unsafe)


def test_post_check_blocks_medication_treatment_and_clinical_directives() -> None:
    unsafe = [
        "Start treatment immediately.",
        "Take medication for this reading.",
        "You should consult your doctor.",
        "The crew should visit a clinician.",
        "Increase your dose.",
        "Continue monitoring and seek care.",
    ]
    assert all(not post_check(text) for text in unsafe)


def test_model_validator_rejects_fabricated_study_ids_urls_and_findings() -> None:
    alert = hrv_alert()
    studies = studies_for_signal("hrv", research_records())
    safe = explain_alert(alert, studies)["text"]
    assert validate_model_explanation(alert, studies, safe)
    assert not validate_model_explanation(alert, studies, safe + " OSD-999.")
    assert not validate_model_explanation(alert, studies, safe + " https://example.com/paper.")
    assert not validate_model_explanation(alert, studies, safe + " The study demonstrates this alert.")


def test_model_validator_requires_alert_values_and_rejects_unsafe_output() -> None:
    alert = hrv_alert()
    studies = studies_for_signal("hrv", research_records())
    safe = explain_alert(alert, studies)["text"]
    assert not validate_model_explanation(alert, studies, safe.replace("50.07", "50.00"))
    assert not validate_model_explanation(alert, studies, safe + " This suggests disease.")
    assert not validate_model_explanation(alert, studies, safe.replace("simulated", "real"))
