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
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: no se pudo iniciar la API"
    exit 1
}
$startedByUs = $true

Write-Host ""
Write-Host "=== 4. HEALTH CHECK ==="
& "$scriptsDir\api-health.ps1"
$healthExit = $LASTEXITCODE

if ($healthExit -eq 0) {
    Write-Host ""
    Write-Host "API READY - OpenCode puede continuar"
    exit 0
}

# Health finito agotado: detener SOLO la instancia que inició este script
# (no tocar otros procesos) y terminar con error. Sin loops ni esperas.
Write-Host ""
Write-Host "FAIL: API no paso health check"
if ($startedByUs) {
    & "$scriptsDir\api-stop.ps1" | Out-Null
}
exit 1
