<#
.SYNOPSIS
    One-shot local dev bootstrap for MediBridge AI on Windows.
    Mirrors scripts/setup-dev.sh.

.PARAMETER Real
    Also install real ML model dependencies (faster-whisper, NLLB, TTS,
    diarization, sentence-transformers, mediapipe). Large download -- may
    take several minutes. Required before running 'npm run dev:real'.

.EXAMPLE
    scripts\setup-dev.ps1          # fixture mode only (fast, no ML deps)
    scripts\setup-dev.ps1 -Real    # also install real ML model dependencies
#>
param(
    [switch]$Real
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

function Assert-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Host "Required tool not found: $Name" -ForegroundColor Red
        exit 1
    }
}

Assert-Command "node"
Assert-Command "npm"
Assert-Command "python"

Set-Location $repoRoot

# ── JS dependencies ────────────────────────────────────────────────────────
Write-Host "Installing JS workspace dependencies (apps/web, services/gateway, packages/*)..." -ForegroundColor Cyan
npm install

# ── Python venvs (dev deps only) ───────────────────────────────────────────
foreach ($service in @("speech-pipeline", "clinical-nlp", "vision-service", "orchestrator")) {
    Write-Host "Setting up services\$service virtualenv..." -ForegroundColor Cyan
    $serviceDir = Join-Path $repoRoot "services\$service"
    $venvPython = Join-Path $serviceDir ".venv\Scripts\python.exe"

    if (-not (Test-Path $venvPython)) {
        python -m venv (Join-Path $serviceDir ".venv")
    }

    & $venvPython -m pip install -r (Join-Path $serviceDir "requirements-dev.txt")
}

# ── Real ML deps (optional) ────────────────────────────────────────────────
if ($Real) {
    Write-Host ""
    Write-Host "Installing real ML model dependencies (large download, may take several minutes)..." -ForegroundColor Cyan

    $speechPip = Join-Path $repoRoot "services\speech-pipeline\.venv\Scripts\pip.exe"
    $clinicalPip = Join-Path $repoRoot "services\clinical-nlp\.venv\Scripts\pip.exe"
    $visionPip = Join-Path $repoRoot "services\vision-service\.venv\Scripts\pip.exe"

    Write-Host "  speech-pipeline: ASR + MT + TTS + diarization + emotion (requirements-full.txt)" -ForegroundColor Gray
    & $speechPip install -r (Join-Path $repoRoot "services\speech-pipeline\requirements-full.txt")

    Write-Host "  clinical-nlp: similarity + summarization (requirements-full.txt)" -ForegroundColor Gray
    & $clinicalPip install -r (Join-Path $repoRoot "services\clinical-nlp\requirements-full.txt")

    Write-Host "  vision-service: mediapipe + opencv (requirements.txt)" -ForegroundColor Gray
    & $visionPip install -r (Join-Path $repoRoot "services\vision-service\requirements.txt")

    Write-Host "Real ML dependencies installed." -ForegroundColor Green
}

# ── .env ───────────────────────────────────────────────────────────────────
$envFile = Join-Path $repoRoot ".env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $repoRoot ".env.example") $envFile
    Write-Host "Created .env from .env.example -- fill in real values before running services." -ForegroundColor Yellow
}

# ── done ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Done." -ForegroundColor Green
if ($Real) {
    Write-Host "  Start (real models):   npm run dev:real" -ForegroundColor Cyan
} else {
    Write-Host "  Start (fixture mode):  npm run dev" -ForegroundColor Cyan
    Write-Host "  Install ML deps later: scripts\setup-dev.ps1 -Real" -ForegroundColor Cyan
}
Write-Host "  Data layer (optional): docker compose -f infra/docker/docker-compose.dev.yml up postgres redis minio -d" -ForegroundColor Cyan
