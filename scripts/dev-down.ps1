<#
.SYNOPSIS
    Stops all MediBridge AI dev services by killing whatever process holds
    each service port. Works regardless of how the processes were started,
    so stale sessions from crashed or manually-launched runs are cleaned up.
#>

$ErrorActionPreference = "SilentlyContinue"
$repoRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $repoRoot ".dev-pids.json"

$ports = @(8001, 8002, 8003, 8004, 4000, 5173)

foreach ($port in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $pid = $conn.OwningProcess
        Write-Host "Stopping port $port (PID $pid)..." -ForegroundColor Cyan
        taskkill /PID $pid /T /F | Out-Null
    }
}

if (Test-Path $pidFile) {
    Remove-Item $pidFile -Force
}

Write-Host "All dev services stopped." -ForegroundColor Green
