# api-stop.ps1 - Detiene la API de ESTE worktree
# Uso: .\scripts\api-stop.ps1
#
# Detiene (1) lo que escuche en el puerto del worktree y (2) cualquier
# instancia de node que ejecute el dist\main.js DE ESTE worktree (aunque esté
# en otro puerto, p. ej. por un arranque con scripts viejos). No toca
# instancias de otros worktrees. No detiene `nest start --watch` (cerrarlo
# con Ctrl+C en su terminal, o relanzará la API solo).

. "$PSScriptRoot\_worktree.ps1"

$port = $ApiPort
Write-Host "Perfil: API_PORT=$ApiPort WEB_PORT=$WebPort ($WorktreeEnvSource)"

function Stop-WorktreePid([int]$id, [string]$why) {
    $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
    if (-not $proc) {
        Write-Host "PID $id ya no existe ($why)"
        return $false
    }
    Write-Host "Deteniendo PID $id ($($proc.ProcessName)) - $why..."
    Stop-Process -Id $id -Force
    return $true
}

$stopped = @()

# 1. Por puerto del worktree
$conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        Where-Object State -eq Listen |
        Select-Object -First 1
if ($conn) {
    if (Stop-WorktreePid $conn.OwningProcess "escucha en puerto $port") { $stopped += $conn.OwningProcess }
}

# 2. Por commandline: node ... <este-worktree>\apps\api\dist\main.js
foreach ($p in (Get-WorktreeApiProcess)) {
    if ($p.ProcessId -in $stopped) { continue }
    if (Stop-WorktreePid $p.ProcessId "ejecuta apps\api\dist\main.js de este worktree") {
        $stopped += $p.ProcessId
    }
}

if ($stopped.Count -eq 0) {
    Write-Host "No hay instancia de este worktree en ejecución (puerto $port libre)."
} else {
    Start-Sleep -Seconds 2
    Write-Host "Detenido: $($stopped -join ', ')"
}

exit 0
