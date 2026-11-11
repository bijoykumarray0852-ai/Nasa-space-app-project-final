# VITALS application

This directory contains the existing Express dashboard and the FastAPI crew-health replay. The full setup, API protocol, deterministic rule definitions, data provenance, safety limitations, test command, and contribution guidance are documented in the repository [README](../../README.md).

**The crew console displays simulated telemetry only. It is not connected to real crew or patient data and is not for diagnosis, treatment, clinical decisions, or operational use.**

Quick start from this directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"
uvicorn src.app:app --host 127.0.0.1 --port 8000
```

In another terminal:

```bash
npm ci
npm start
```

Run tests with `pytest -q`. The Python service's API documentation is served at `http://127.0.0.1:8000/docs`.
