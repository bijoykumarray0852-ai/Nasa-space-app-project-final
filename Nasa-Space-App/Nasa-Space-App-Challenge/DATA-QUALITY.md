# Data quality and scientific validation

VITALS is a research-inspired training simulation, not a medical device or a validated clinical prediction model. Its validation checks catch malformed data; they do not prove that a reading is accurate, representative, or safe to act on.

## Realtime alerts and privacy

When served by the included Express app, open mission pages receive database-backed updates over Server-Sent Events (SSE). New alerts are shown in the app immediately; optional browser notifications can be enabled with the bell button and are delivered only while the page is in the background. Browser notifications require browser permission and a secure context (HTTPS or localhost). Realtime updates and notifications use the included app and browser APIs; no paid push service is required. Mission APIs require a session established with the server-configured shared password. Presence names and roles are length/type-validated by the API and rendered as text, but presence identities and demo roles are not independently authenticated. The shared password does not provide per-user identity or role-based authorization; do not use demo roles to protect sensitive or real medical data.

## Mission decision challenge

The Mission Scenarios page includes a daily operational decision exercise that rotates by UTC date. Scores and streaks are stored in browser local storage and are not synced to the server. Scenarios reward data verification, following approved procedures, and clear communication; they are authored training examples, not clinical or flight instructions.

## Data sources and provenance

- **Legacy dashboard simulation:** live vital frames on the existing mission dashboard are generated locally from simulated mission state with small random variation. They are not measurements from a wearable, spacecraft, or NASA network.
- **Crew console replay:** the separate long-duration crew console uses the fixed, hand-authored `demo_fixtures/vitals.json` fixture. It is deterministic, carries `is_simulated: true`, and is labeled as simulated in the interface. Replay speed changes delivery timing only; it does not change the fixture data.
- **Imported CSV:** daily telemetry is supplied by the user. Imported rows retain their `imported` source label; malformed numeric rows and values outside the accepted input ranges are skipped and reported in the Data Quality panel. Missing required readings remain visible as quality issues.
- **Hybrid:** daily mission state blends simulator values with a matching imported frame. This is a training-only blend, not a scientifically validated data-fusion method.
- **Live sensor:** the interface can label a frame as `sensor` for a future integration, but this project does not connect to a real sensor by default.

The Operations page shows the selected mission mode. Each telemetry frame also carries a source and timestamp when available. Imported CSV timestamps are optional; if omitted, the frame is flagged as missing timestamp rather than assigned a fabricated observation time.

## CSV format and units

Rows use this order (a header row is optional):

```text
day,hr,spo2,temp,rad,sleep,exercise,mood,timestamp
1,74,98,36.6,1.2,7.5,80,4,2026-10-28T00:00:00Z
```

For a header row, use the field names above or unit-bearing aliases such as `hr_bpm`, `spo2_pct`, `temp_c`, `rad_msv`, `sleep_hours`, `exercise_min`, `mood_1_to_5`, and `timestamp_iso8601`. Unknown or explicitly unsupported unit headers are rejected and reported. Without a header, values are assumed to use the units below.

| Field | Unit | Accepted input range |
|---|---|---:|
| `day` | mission day | integer 0–180 |
| `hr` | beats per minute (bpm) | 0–250 |
| `spo2` | percent (%) | 0–100 |
| `temp` | degrees Celsius (°C) | 25–45 |
| `rad` | cumulative dose (mSv) | 0–650 |
| `sleep` | hours | 0–24 |
| `exercise` | minutes per day | 0–1440 |
| `mood` | unitless score | 1–5 |
| `timestamp` | ISO-8601 date/time with timezone | Optional |

These are ingestion bounds, not clinical reference ranges. Missing required readings and missing sleep/exercise/mood check-ins are retained as missing and flagged. Check-in columns may be omitted from a CSV row, but their absence lowers data coverage and can make a prediction outcome unevaluable. Invalid numeric rows are excluded from mission-state rebuilding so they cannot silently contaminate trends. A missing timestamp is not replaced with the import time.

Live and daily frames are checked for missing required measurements, finite numeric values, accepted bounds, supported source labels, explicit unit mismatches, valid ISO-8601 timestamps, and timestamps more than five minutes in the future. Sensor anomaly thresholds (for example, heart-rate and SpO₂ warnings) are separate from these data-integrity checks.

## Prediction formulas and outcome comparison

The health risk predictor uses the first and last valid samples in the recent window to estimate a per-mission-day slope: `(last value - first value) / elapsed mission days`. It uses up to seven daily frames for heart rate and SpO₂, up to three logged sleep/exercise check-ins (otherwise the current check-in input provisionally), and up to seven health-history days. A forecast projects heart rate and SpO₂ by `current + slope × horizon` (clamped to 40–180 bpm and 80–100%) and each health index by the same slope (clamped to 0–100).

Rule points are added as follows:

- Heart rate: projected ≥100 bpm adds 2; else ≥90 adds 1. A rising slope ≥3 bpm/day adds 1.
- SpO₂: projected <93% adds 2; else <95% adds 1. A falling slope ≤−0.5 percentage points/day adds 1.
- Average sleep: <5 hours adds 2; else <7 adds 1.
- Average exercise: <30 minutes/day adds 1.
- Each projected non-radiation health index below 55 adds 2, or below 78 adds 1. A declining index slope ≤−0.2 points/day adds 1 when no projected warning/critical range applies.

Scores map to Low (0–1), Medium (2–4), and High (5+). These rules and thresholds are application design choices, not validated clinical cutoffs. The confidence label describes data coverage only: high requires at least five telemetry frames, three check-ins, and five health-history days; medium requires at least two frames, one check-in, and two history days; otherwise it is low. Confidence is downgraded for longer horizons and is not a probability.

The forecast pipeline does not include radiation as a separate risk-score term. Radiation remains a displayed mission health indicator and its own alert/risk threshold is separate.

At each mission-day advance, the current forecast scores are snapshotted for their target days. On a target day, the same rule-scoring function scores observed day-specific telemetry, check-in, and health values. A comparison is marked not evaluable if required target-day values are missing or invalid. The displayed match count is descriptive for this one simulated mission; it is not a statistically meaningful accuracy estimate and is not validation against astronaut outcomes.

## Simulation and imported-data mapping formulas

The daily mission simulator applies simplified bounded update equations. Let `e = min(1, exercise minutes / 90)` and `t = 1 + mission day / 360`:

- Bone index: add `e × 0.35 × (1 − day/500) − 0.25 × t − 0.08 if EVA`; clamp 40–100.
- Cardiovascular index: add `e × 0.45 − 0.3 + 0.1 if sleep ≥6h, else −0.2`; clamp 40–100.
- Immune index: add `+0.3 if sleep ≥7h, 0 if sleep ≥5h, else −0.6`, then `event immune modifier ×0.3 −0.1`; clamp 30–100.
- Radiation: add `(event dose, or 0.4 mSv) × (1 + day/720)`, plus 1.8 mSv for EVA; clamp at 650 mSv.
- Behavioral index: add `(mood −3)×1.1 +0.3 if sleep ≥6h, else −0.5 + event behavioral modifier ×0.3`; clamp 30–100.

For imported CSV-derived health snapshots, missing heart rate, SpO₂, and temperature use neutral reference defaults of 72 bpm, 97%, and 36.6°C; missing sleep, exercise, and mood use 7 hours, 75 minutes/day, and score 3. Quality warnings remain visible, and the original missing values are not rewritten. Define `hrPenalty = max(0,hr−72)×0.9 + max(0,60−hr)×0.45`, `spo2Penalty = max(0,97−spo2)×5.8`, `tempPenalty = abs(temp−36.6)×7`, `exerciseBoost = min(9,max(0,exercise−45)×0.11)`, `sleepBoost = clamp((sleep−6.5)×3,−12,7)`, and `moodBoost = (mood−3)×4.5`. The imported snapshot equations are:

- Bone: `clamp(100 − rowIndex×0.14 − radiation×0.018 + exerciseBoost, 42, 100)`.
- Cardiovascular: `clamp(100 − hrPenalty − radiation×0.02 + exerciseBoost×0.55 + sleepBoost×0.25, 35, 100)`.
- Immune: `clamp(100 − spo2Penalty − tempPenalty − radiation×0.012 + sleepBoost, 30, 100)`.
- Behavioral: `clamp(100 − max(0,hr−82)×0.5 − tempPenalty×0.7 + sleepBoost + moodBoost, 30, 100)`.
- Radiation is the imported dose clamped to 0–650 mSv.

Hybrid mode blends non-radiation indices 45% simulated / 55% imported and retains the higher of the two radiation values. This blend is a UI scenario assumption, not validated sensor fusion.

## Scientific context

The legacy scenario indicators are application heuristics and are not calibrated to a research cohort. OSDR/GeneLab study-level metadata for those indicators has not been independently verified and is not presented as evidence. The crew console's local cache contains one NASA NTRS record with verified title/identifier metadata; its retrieval date was not retained. The NTRS source is displayed only as research context and is not claimed to validate an alert or define a threshold. See `demo_fixtures/research_metadata.json`.

The live simulated telemetry is derived from the app's current state and perturbed with random noise. All derived health indicators, anomaly thresholds, risk point weights, and forecast categories are simplified application rules. They are not fitted to a clinical cohort and do not model measurement uncertainty, individual baselines, sensor calibration, or causal physiology.

The separate crew console replays the synthetic rows in `demo_fixtures/vitals.json`, one row per wall-clock second at 1x. Fixture timestamps represent daily synthetic observations; changing replay speed changes delivery time, not the timestamps. The HRV field is simulated RMSSD in milliseconds. Its rule compares the current reading to valid prior readings within the preceding 30 days, requires 30 samples, uses sample standard deviation (`ddof=1`), and fires only at `z <= -2.0`; its rule ID is `hrv_below_personal_baseline`. Each other signal uses the preceding 30-day time window, requires 24 valid samples, and flags absolute z-scores of at least 2.5. Those are engineering demonstration thresholds, not medical thresholds. Baselines exclude the current reading. Missing current values are marked missing, insufficient history remains unevaluated, and zero-variation baselines are marked degenerate rather than normal. Duplicate or out-of-order timestamps and non-finite/out-of-range values are rejected. Irregular sampling is accepted without interpolation; sample count and observed baseline start/end are returned. The plotted band is the actual baseline mean ±2 sample standard deviations when available.

The multi-signal rule counts distinct signals with eligible deviations in the inclusive rolling 48-hour interval. Repeated deviations of one signal count once; contributors retain their exact readings and rule IDs. This is temporal co-occurrence only and does not establish a shared cause. A replay completes at the end of the fixture and waits for Restart; pause, resume, restart, and speed commands apply to each WebSocket session. Recent alerts and current state are in-memory demo state, not persistent history.

The only currently verified research-cache record is NASA NTRS 20040087874, “Microgravity alters respiratory sinus arrhythmia and short-term heart rate variability in humans” (`https://ntrs.nasa.gov/citations/20040087874`). The official title and identifier were checked through the public NTRS search API in prior work; the retrieval date was not saved. OSDR and GeneLab are discovery sources, but no study-level records are cited until their metadata is independently verified. The optional explanation runtime, when enabled by the existing dashboard environment, receives only a validated alert and its relevant verified research metadata. Structured validation, deterministic claim checks, evidence-ID/URL allowlisting, and required alert-number checks fail closed. These checks are conservative but cannot reliably detect every possible implicit medical claim; the core deterministic explanation is the default.

## Limitations and reproducibility

- Public NASA/spaceflight publications inform context and illustrative ranges; this application does not ingest raw NASA data at runtime, reproduce a cited study, or imply NASA endorsement.
- Simulated telemetry contains randomness. A scenario's rule score may be repeatable while live simulated readings are not.
- Imported timestamps and unit declarations depend on the data provider. CSV values are assumed to use the documented units because this compact CSV format has no unit metadata columns.
- Source labels and demo operator roles are application metadata, not cryptographic provenance or authentication.
- Missing data, bounded imputation for derived display indicators, and incomplete forecast coverage reduce interpretability. Review the Data Quality panel before interpreting a trend.
- Nothing in VITALS is diagnosis, treatment guidance, operational flight clearance, or an emergency response system.

For source citations and background links, see the Data Sources page in the app.
