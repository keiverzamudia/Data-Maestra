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

# Iniciar Node completamente desacoplado mediante WMI Win32_Process.Create.
# RAZÓN: Start-Process hereda el stdin del shell que lo invoca (WinPS 5.1 no
# tiene -RedirectStandardInput). Un hijo de larga vida con ese pipe heredado
# mantiene viva la espera del proceso lanzador aunque el script ya terminó.
# Win32_Process.Create genera un proceso sin consola, sin ningún pipe heredado
# (stdin NUL) y con stdout/stderr redirigidos a archivos por el propio hijo.
# El script lanzador puede terminar (exit 0) mientras Node sigue vivo.
$nodePath = (Get-Command $nodeExe -ErrorAction Stop).Source
# Forma canónica cmd /S /C ""exe" args >> out 2>> err"": con /S se recorta
# únicamente el par exterior y el interior queda balanceado. Sin /S, cmd
# recortaría la primera y la última comilla rompiendo las rutas con espacios.
$cmdLine = "cmd.exe /S /C `"`"$nodePath`" `"$mainJs`" >> `"$logFile`" 2>> `"$errFile`"`""

try {
    $created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine = $cmdLine
        CurrentDirectory = $apiDir
    } -ErrorAction Stop
} catch {
    Write-Host "ERROR: no se pudo crear el proceso desacoplado: $($_.Exception.Message)"
    exit 1
}

if (-not $created -or $created.ReturnValue -ne 0) {
    Write-Host "ERROR: Win32_Process.Create devolvió $($created.ReturnValue)"
    exit 1
}

Write-Host "API iniciada - PID: $($created.ProcessId) (proceso desacoplado, sin pipes heredados)"
Write-Host "Logs: $logFile / $errFile"
