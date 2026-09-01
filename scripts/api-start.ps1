# api-start.ps1 - Inicia la API de forma desacoplada del shell
# Uso: .\scripts\api-start.ps1
# Retorna inmediatamente. El proceso Node continua en background.

$port = 3001
$projectRoot = Split-Path $PSScriptRoot -Parent
$apiDir = Join-Path $projectRoot "apps\api"
$nodeExe = "node"
$mainJs = Join-Path $apiDir "dist\main.js"
$logFile = Join-Path $apiDir "api.log"
$errFile = Join-Path $apiDir "api.err.log"

# Verificar que el build existe
if (-not (Test-Path $mainJs)) {
    Write-Host "ERROR: $mainJs no existe. Ejecuta build primero."
    exit 1
}

# Verificar si ya hay algo escuchando en el puerto
$existing = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
            Where-Object State -eq Listen |
            Select-Object -First 1
if ($existing) {
    Write-Host "Puerto $port ya en uso (PID $($existing.OwningProcess)). Usa api-stop.ps1 primero."
    exit 1
}

# Limpiar logs anteriores
if (Test-Path $logFile) { Remove-Item $logFile -Force }
if (Test-Path $errFile) { Remove-Item $errFile -Force }

# Iniciar Node completamente desacoplado
# -WindowStyle Hidden crea un proceso fuera de la consola actual
# Redirigimos stdout/stderr a archivos para diagnostico
$startArgs = @{
    FilePath     = $nodeExe
    ArgumentList = $mainJs
    WorkingDirectory = $apiDir
    WindowStyle = "Hidden"
    RedirectStandardOutput = $logFile
    RedirectStandardError = $errFile
}

$proc = Start-Process @startArgs -PassThru

Write-Host "API iniciada - PID: $($proc.Id)"
Write-Host "Logs: $logFile / $errFile"
