from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from pydantic import ValidationError

from src.compute.schemas import ResearchMetadata

SOURCE_HOSTS = {
    "OSDR": {"osdr.nasa.gov"},
    "GeneLab": {"genelab.nasa.gov"},
    "NTRS": {"ntrs.nasa.gov"},
}
SIGNAL_STUDY_RELEVANCE = {
    "hrv": {"NASA NTRS 20040087874"},
}


def load_research_cache(path: Path) -> list[dict[str, Any]]:
    try:
        raw: Any = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Unable to load research metadata cache: {error}") from error
    if not isinstance(raw, list) or len(raw) > 100:
        raise ValueError("Research metadata cache must be an array of at most 100 records.")

    records: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, value in enumerate(raw):
        try:
            record = ResearchMetadata.model_validate(value).model_dump(mode="json")
        except ValidationError as error:
            raise ValueError(f"Invalid research cache record at index {index}: {error}") from error
        parsed_url = urlparse(record["canonical_url"])
        if parsed_url.scheme != "https" or parsed_url.hostname not in SOURCE_HOSTS[record["source"]]:
            raise ValueError(f"Research record {record['study_id']} has a non-canonical or untrusted source URL.")
        if record["study_id"] in seen_ids:
            raise ValueError(f"Duplicate research study id: {record['study_id']}")
        seen_ids.add(record["study_id"])
        records.append(record)
    return records


def studies_for_signal(signal: str | None, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if signal is None:
        return []
    allowed_ids = SIGNAL_STUDY_RELEVANCE.get(signal, set())
    return [
        record for record in records
        if record["study_id"] in allowed_ids and record["verification_status"] == "verified"
    ]
