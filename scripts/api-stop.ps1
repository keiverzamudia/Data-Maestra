# api-stop.ps1 - Detiene la API que escucha en puerto 3001
# Uso: .\scripts\api-stop.ps1

$port = 3001
$conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        Where-Object State -eq Listen |
        Select-Object -First 1

if (-not $conn) {
    Write-Host "No hay proceso escuchando en puerto $port"
    exit 0
}

$targetPid = $conn.OwningProcess
$proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue

if ($proc) {
    Write-Host "Deteniendo PID $targetPid ($($proc.ProcessName)) en puerto $port..."
    Stop-Process -Id $targetPid -Force
    Start-Sleep -Seconds 2
    Write-Host "Detenido"
} else {
    Write-Host "PID $targetPid no encontrado (ya detenido)"
}

exit 0
