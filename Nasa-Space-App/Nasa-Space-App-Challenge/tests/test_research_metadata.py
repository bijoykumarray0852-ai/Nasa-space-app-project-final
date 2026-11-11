import json
from pathlib import Path

import pytest

from src.research import load_research_cache, studies_for_signal

ROOT = Path(__file__).resolve().parents[1]


def test_cache_contains_only_validated_authoritative_urls_and_retains_source_fields() -> None:
    records = load_research_cache(ROOT / "demo_fixtures" / "research_metadata.json")
    assert len(records) == 1
    record = records[0]
    assert record["study_id"] == "NASA NTRS 20040087874"
    assert record["source"] == "NTRS"
    assert record["canonical_url"] == "https://ntrs.nasa.gov/citations/20040087874"
    assert record["verification_status"] == "verified"
    assert record["retrieved_at"] is None


def test_research_association_is_signal_specific_and_requires_verified_metadata() -> None:
    records = load_research_cache(ROOT / "demo_fixtures" / "research_metadata.json")
    assert studies_for_signal("hrv", records) == records
    assert studies_for_signal("heart_rate", records) == []
    records[0]["verification_status"] = "unverified"
    assert studies_for_signal("hrv", records) == []


@pytest.mark.parametrize(
    "record",
    [
        {
            "study_id": "NASA NTRS 20040087874",
            "title": "Title",
            "source": "NTRS",
            "canonical_url": "http://ntrs.nasa.gov/citations/20040087874",
            "relevance_notes": "Context only.",
            "verification_status": "verified",
        },
        {
            "study_id": "UNKNOWN-1",
            "title": "Title",
            "source": "NTRS",
            "canonical_url": "https://example.com/paper",
            "relevance_notes": "Context only.",
            "verification_status": "verified",
        },
    ],
)
def test_cache_rejects_non_https_or_untrusted_study_urls(tmp_path: Path, record: dict) -> None:
    path = tmp_path / "studies.json"
    path.write_text(json.dumps([record]), encoding="utf-8")
    with pytest.raises(ValueError, match="non-canonical or untrusted"):
        load_research_cache(path)


def test_cache_rejects_duplicate_study_identifiers(tmp_path: Path) -> None:
    record = load_research_cache(ROOT / "demo_fixtures" / "research_metadata.json")[0]
    path = tmp_path / "studies.json"
    path.write_text(json.dumps([record, record]), encoding="utf-8")
    with pytest.raises(ValueError, match="Duplicate research study id"):
        load_research_cache(path)
