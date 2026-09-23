#!/usr/bin/env bash
# One-shot local dev bootstrap. Assumes Node 20+, Python 3.11+, Docker installed.
#
# Usage:
#   bash scripts/setup-dev.sh          # fixture mode only (fast, no ML deps)
#   bash scripts/setup-dev.sh --real   # also install real ML model dependencies
set -euo pipefail

REAL=0
for arg in "$@"; do [[ "$arg" == "--real" ]] && REAL=1; done

echo "Installing JS workspace dependencies (apps/web, services/gateway, packages/*)..."
npm install

for service in speech-pipeline clinical-nlp vision-service orchestrator; do
  echo "Setting up services/${service} virtualenv..."
  python3 -m venv "services/${service}/.venv"
  "services/${service}/.venv/bin/pip" install -r "services/${service}/requirements-dev.txt"
done

if [[ $REAL -eq 1 ]]; then
  echo ""
  echo "Installing real ML model dependencies (large download, may take several minutes)..."

  echo "  speech-pipeline: ASR + MT + TTS + diarization + emotion (requirements-full.txt)"
  services/speech-pipeline/.venv/bin/pip install -r services/speech-pipeline/requirements-full.txt

  echo "  clinical-nlp: similarity + summarization (requirements-full.txt)"
  services/clinical-nlp/.venv/bin/pip install -r services/clinical-nlp/requirements-full.txt

  echo "  vision-service: mediapipe + opencv (requirements.txt)"
  services/vision-service/.venv/bin/pip install -r services/vision-service/requirements.txt

  echo "Real ML dependencies installed."
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — fill in real values before running services."
fi

echo ""
echo "Done."
if [[ $REAL -eq 0 ]]; then
  echo "  Start (fixture mode):  bash scripts/dev-up.sh"
  echo "  Install ML deps later: bash scripts/setup-dev.sh --real"
else
  echo "  Start (real models):   bash scripts/dev-up.sh --real"
fi
echo "  Data layer (optional): docker compose -f infra/docker/docker-compose.dev.yml up postgres redis minio -d"
