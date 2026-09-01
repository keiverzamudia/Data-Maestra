# api-restart.ps1 - Build + Stop + Start + Health
# Uso: .\scripts\api-restart.ps1
# TERMINA completamente una vez que la API esta lista.

$scriptsDir = $PSScriptRoot

Write-Host "=== 1. BUILD API ==="
pnpm --filter @master-data/api run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: Build fallo"
    exit 1
}
Write-Host "Build OK"

Write-Host ""
Write-Host "=== 2. STOP API ==="
& "$scriptsDir\api-stop.ps1"

Write-Host ""
Write-Host "=== 3. START API (desacoplada) ==="
& "$scriptsDir\api-start.ps1"

Write-Host ""
Write-Host "=== 4. HEALTH CHECK ==="
& "$scriptsDir\api-health.ps1"
$healthExit = $LASTEXITCODE

if ($healthExit -eq 0) {
    Write-Host ""
    Write-Host "API READY - OpenCode puede continuar"
} else {
    Write-Host ""
    Write-Host "FAIL: API no paso health check"
    exit 1
}

exit 0
