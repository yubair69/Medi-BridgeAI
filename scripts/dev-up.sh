#!/usr/bin/env bash
# Starts all MediBridge AI dev processes (speech-pipeline, clinical-nlp,
# orchestrator, vision-service, gateway, web) in the background.
#
# Usage:
#   bash scripts/dev-up.sh          # fixture mode (no model downloads)
#   bash scripts/dev-up.sh --real   # real ML models (slow first boot)
#   bash scripts/dev-up.sh --stop   # stop everything started by a previous run
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$REPO_ROOT/.dev-pids.json"
LOG_DIR="$REPO_ROOT/.dev-logs"

# ── stop mode ─────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--stop" ]]; then
    # Kill by port — reliable regardless of how processes were started.
    # Uses ss (iproute2) which is available on all modern Linux.
    for port in 8001 8002 8003 8004 4000 5173; do
        pid=$(ss -tlnp "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
        if [[ -n "$pid" ]]; then
            echo "Stopping port $port (pid $pid)..."
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
    rm -f "$PID_FILE"
    echo "All dev services stopped."
    exit 0
fi

# ── guard against double-start ─────────────────────────────────────────────
if [[ -f "$PID_FILE" ]]; then
    echo "A previous dev session's PID file already exists: $PID_FILE"
    echo "Run:  bash scripts/dev-up.sh --stop"
    exit 1
fi

# ── load .env if present ──────────────────────────────────────────────────
if [[ -f "$REPO_ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.env"
    set +a
fi

# ── parse flags ────────────────────────────────────────────────────────────
REAL=0
for arg in "$@"; do [[ "$arg" == "--real" ]] && REAL=1; done

if [[ $REAL -eq 0 ]]; then
    FIXTURE_MODE=1
    echo "Starting in FIXTURE mode (deterministic, no model downloads). Pass --real for the real ML pipeline."
else
    FIXTURE_MODE=
    echo "Starting in REAL model mode -- expect slower startup (model downloads/loads)."
fi

# ── preflight checks ───────────────────────────────────────────────────────
assert_venv() {
    local service="$1"
    local python="$REPO_ROOT/services/$service/.venv/bin/python"
    if [[ ! -x "$python" ]]; then
        echo "Missing venv: services/$service/.venv"
        echo "Run:  cd services/$service && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt"
        exit 1
    fi
    echo "$python"
}

SPEECH_PYTHON=$(assert_venv "speech-pipeline")
CLINICAL_PYTHON=$(assert_venv "clinical-nlp")
ORCHESTRATOR_PYTHON=$(assert_venv "orchestrator")
VISION_PYTHON=$(assert_venv "vision-service")

if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
    echo "Missing root node_modules -- run 'npm install' first."
    exit 1
fi

# ── launch helpers ─────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"
PIDS_JSON="["

# start_service TITLE WORKDIR [ENV_KEY=VAL ...] -- CMD [ARGS...]
# Everything after '--' is the command; everything before is extra env vars.
start_service() {
    local title="$1"
    local workdir="$2"
    local logfile="$LOG_DIR/$title.log"
    shift 2

    # Collect extra env vars (KEY=VAL) until we hit '--'
    local -a extra_env=()
    while [[ $# -gt 0 && "$1" != "--" ]]; do
        extra_env+=("$1")
        shift
    done
    [[ "${1:-}" == "--" ]] && shift   # consume the separator

    # Use `env` so the vars are passed to setsid's child directly,
    # not just set on the subshell that launches setsid.
    (cd "$workdir" && setsid env "${extra_env[@]}" "$@" >> "$logfile" 2>&1) &
    local pid=$!
    echo "Started $title (pid $pid) → $logfile"
    PIDS_JSON+=$(printf '{"title":"%s","pgid":%d},' "$title" "$pid")
}

# ── start services ─────────────────────────────────────────────────────────
start_service "speech-pipeline" "$REPO_ROOT/services/speech-pipeline" \
    MEDIBRIDGE_FIXTURE_MODE="$FIXTURE_MODE" \
    PYTHONPATH=. \
    CLINICAL_NLP_URL="http://localhost:8002" \
    ORCHESTRATOR_URL="http://localhost:8004" \
    HF_TOKEN="${HF_TOKEN:-}" \
    HUGGING_FACE_HUB_TOKEN="${HF_TOKEN:-}" \
    -- "$SPEECH_PYTHON" -m uvicorn app.main:app --port 8001

start_service "clinical-nlp" "$REPO_ROOT/services/clinical-nlp" \
    MEDIBRIDGE_FIXTURE_MODE="$FIXTURE_MODE" \
    PYTHONPATH=. \
    -- "$CLINICAL_PYTHON" -m uvicorn app.main:app --port 8002

start_service "orchestrator" "$REPO_ROOT/services/orchestrator" \
    PYTHONPATH=. \
    -- "$ORCHESTRATOR_PYTHON" -m uvicorn app.main:app --port 8004

start_service "vision-service" "$REPO_ROOT/services/vision-service" \
    MEDIBRIDGE_FIXTURE_MODE="$FIXTURE_MODE" \
    PYTHONPATH=. \
    -- "$VISION_PYTHON" -m uvicorn app.main:app --port 8003

start_service "gateway" "$REPO_ROOT/services/gateway" \
    SPEECH_PIPELINE_WS_URL="ws://localhost:8001/ws/transcribe" \
    ORCHESTRATOR_URL="http://localhost:8004" \
    VISION_SERVICE_URL="http://localhost:8003" \
    -- npm run dev

start_service "web" "$REPO_ROOT/apps/web" \
    -- npm run dev

# ── write PID file ─────────────────────────────────────────────────────────
PIDS_JSON="${PIDS_JSON%,}]"
echo "$PIDS_JSON" > "$PID_FILE"

echo ""
echo "All six services are launching in the background."
echo "Logs: $LOG_DIR/"
echo "Frontend usually at http://localhost:5173  (tail -f $LOG_DIR/web.log)"
echo "Stop with:  bash scripts/dev-up.sh --stop"
