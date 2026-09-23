# Running MediBridge AI — Quick Reference

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20+ | `node --version` |
| Python | 3.11+ | `python3 --version` |
| Docker | any recent | for Postgres, Redis, MinIO |
| npm | bundled with Node | |

---

## One-time setup

**Linux:**
```bash
# Fixture mode only (fast, no ML downloads)
bash scripts/setup-dev.sh

# Also install real ML deps (faster-whisper, NLLB, mediapipe, etc.)
bash scripts/setup-dev.sh --real

# npm shortcuts
npm run setup:linux
npm run setup:linux:real
```

**Windows (PowerShell):**
```powershell
# Fixture mode only
scripts\setup-dev.ps1
npm run setup          # same via npm

# Also install real ML deps
scripts\setup-dev.ps1 -Real
npm run setup:real     # same via npm
```

`.env` is created automatically from `.env.example` on first run.

> **OpenRouter API key** — if you want real LLM summarization, open `.env` and fill in `OPENROUTER_API_KEY`. Everything else works without it.

---

## Start / stop — Linux

```bash
# Start everything (fixture mode — instant, no model downloads)
bash scripts/dev-up.sh

# Start with real ML models (slower — downloads whisper/NLLB/mediapipe on first run)
bash scripts/dev-up.sh --real

# Stop everything
bash scripts/dev-up.sh --stop
```

Logs land in `.dev-logs/<service>.log`. Tail one if something looks wrong:

```bash
tail -f .dev-logs/speech-pipeline.log
tail -f .dev-logs/gateway.log
tail -f .dev-logs/web.log
```

---

## Start / stop — Windows (PowerShell)

```powershell
# Start everything (fixture mode)
npm run dev

# Start with real ML models
npm run dev:real

# Stop everything
npm run dev:stop
```

Or call the scripts directly:

```powershell
scripts\dev-up.ps1          # fixture mode
scripts\dev-up.ps1 -Real    # real models
scripts\dev-down.ps1        # stop
```

---

## Open the app

Once started, open **http://localhost:5173** in a browser.

Give services ~5–10 seconds to come up. If the page loads but shows errors, check the logs.

---

## Data layer (Postgres / Redis / MinIO)

The dev scripts start the application services but not the data layer. Start it separately with Docker:

```bash
# Start
docker compose -f infra/docker/docker-compose.dev.yml up postgres redis minio -d

# Stop
docker compose -f infra/docker/docker-compose.dev.yml down
```

> The app works without the data layer in fixture mode — session memory won't persist across restarts, but the UI is fully usable.

---

## Run tests

### All JS tests (gateway + frontend)

```bash
# Linux
cd services/gateway && npx vitest run
cd apps/web && npx vitest run

# Windows — same commands, or from repo root:
npm run test:js
```

### Python service tests

```bash
# Run from the service directory (repeat for each service)
cd services/vision-service
MEDIBRIDGE_FIXTURE_MODE=1 .venv/bin/pytest tests/ -v

cd services/speech-pipeline
MEDIBRIDGE_FIXTURE_MODE=1 .venv/bin/pytest tests/ -v

cd services/clinical-nlp
MEDIBRIDGE_FIXTURE_MODE=1 .venv/bin/pytest tests/ -v

cd services/orchestrator
MEDIBRIDGE_FIXTURE_MODE=1 .venv/bin/pytest tests/ -v
```

On Windows, replace `.venv/bin/` with `.venv\Scripts\`:

```powershell
$env:MEDIBRIDGE_FIXTURE_MODE="1"; .venv\Scripts\pytest tests/ -v
```

### E2E tests (Playwright)

Requires all services running in fixture mode first (see Start / stop above).

```bash
cd apps/web
npx playwright install --with-deps chromium   # first time only
npm run e2e
```

---

## Lint and type-check

```bash
# TypeScript
cd services/gateway && npx tsc --noEmit
cd apps/web && npx tsc --noEmit

# Python — mypy + ruff (repeat per service)
cd services/vision-service
.venv/bin/mypy app
.venv/bin/ruff check .
```

---

## Port map

| Service | Port |
|---------|------|
| Frontend (Vite) | 5173 |
| Gateway | 4000 |
| speech-pipeline | 8001 |
| clinical-nlp | 8002 |
| vision-service | 8003 |
| orchestrator | 8004 |
| Postgres | 5432 |
| Redis | 6379 |
| MinIO | 9000 / 9001 |

---

## Fixture mode vs real mode

| | Fixture mode (default) | Real mode (`--real`) |
|--|------------------------|----------------------|
| Startup time | Instant | 1–5 min (model downloads on first run) |
| ASR | Returns canned Hindi transcript | faster-whisper (real speech recognition) |
| Translation | Returns canned English text | NLLB-200 |
| TTS | Silent | facebook/mms-tts-eng |
| Diarization | Always "speaker_a" | ECAPA-TDNN embeddings |
| Pose detection | No-op (no camera frames analysed) | mediapipe |
| Microphone needed | No | Yes |
| `MEDIBRIDGE_FIXTURE_MODE` | `1` | unset |

> Fixture mode is enough to see the full UI, test every panel, and run E2E specs.

---

## Troubleshooting

**"Address already in use" on a port**
A previous run left a process alive. Find and kill it:
```bash
# Linux
lsof -ti :8001 | xargs kill   # replace 8001 with the conflicting port

# Windows
netstat -ano | findstr :8001
taskkill /PID <pid> /F
```
Or just run `bash scripts/dev-up.sh --stop` (Linux) / `npm run dev:stop` (Windows) first.

**"Missing venv: services/speech-pipeline/.venv"**
The one-time setup hasn't been run yet:
```bash
bash scripts/setup-dev.sh
```

**Speech-pipeline shows "faster-whisper is not installed"**
The service is running without `MEDIBRIDGE_FIXTURE_MODE=1`. Stop everything and restart — the fixed `dev-up.sh` passes the env var correctly via `env KEY=VAL -- cmd`.

**"Conversation memory unavailable (status 404)"**
Normal at the very start of a session before the first transcript event is received. It clears automatically once recording begins.
