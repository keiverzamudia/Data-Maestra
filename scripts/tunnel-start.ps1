# tunnel-start.ps1 - Tunnel rapido de Cloudflare contra el web de ESTE worktree.
#
#   .\scripts\tunnel-start.ps1          # resuelve, avisa y lanza (Ctrl+C corta)
#   .\scripts\tunnel-start.ps1 -Check   # verifica y termina; NO lanza nada
#
# No depende del PATH de la sesion: resuelve cloudflared en tres pasos
# (Get-Command -> %LOCALAPPDATA% -> registro HKCU/HKLM) para que funcione
# aunque el terminal haya nacido antes de instalarlo.
#
# Exit codes:
#   0 = listo para el tunnel (con aviso si el web no responde)
#   1 = cloudflared no se encontro

[CmdletBinding()]
param(
    [switch]$Check
)

. "$PSScriptRoot\_worktree.ps1"

$target = "http://localhost:$WebPort"

function Resolve-Cloudflared {
    # 1) El PATH de la sesion actual ya lo conoce.
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Path) { return $cmd.Path }

    # 2) Ubicacion de instalacion por defecto (no depende del PATH).
    $local = Join-Path $env:LOCALAPPDATA "cloudflared\cloudflared.exe"
    if (Test-Path -LiteralPath $local) { return $local }

    # 3) Ultimo recurso: leer el PATH persistido en el registro (para
    #    terminales que no heredaron el PATH actualizado de la sesion).
    $roots = @(
        'HKCU:\Environment',
        'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment'
    )
    foreach ($root in $roots) {
        $value = (Get-ItemProperty -Path $root -Name 'Path' -ErrorAction SilentlyContinue).Path
        if (-not $value) { continue }
        foreach ($dir in ($value -split ';')) {
            if (-not $dir) { continue }
            $cand = Join-Path $dir 'cloudflared.exe'
            if (Test-Path -LiteralPath $cand) { return $cand }
        }
    }
    return $null
}

$cloudflared = Resolve-Cloudflared

Write-Host "Worktree    : $RepoRoot"
Write-Host "Puertos     : API=$ApiPort WEB=$WebPort ($WorktreeEnvSource)"
Write-Host "Origen      : $target"
if ($cloudflared) {
    Write-Host "cloudflared : $cloudflared"
} else {
    Write-Host "cloudflared : NO ENCONTRADO"
}

if (-not $cloudflared) {
    Write-Host ""
    Write-Host "ERROR: cloudflared no se encontro."
    Write-Host "Binario esperado: $env:LOCALAPPDATA\cloudflared\cloudflared.exe"
    Write-Host "Descarga oficial: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    exit 1
}

# Preflight: el tunnel reenvia al web; sin web activo Cloudflare devolvera 502.
$originOk = $false
try {
    Invoke-WebRequest -Uri $target -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop | Out-Null
    $originOk = $true
} catch {
    $originOk = $false
}
if (-not $originOk) {
    Write-Host ""
    Write-Host "AVISO: $target no responde. Levanta el web (pnpm dev) primero o el tunnel devolvera 502."
}

Write-Host ""

if ($Check) {
    if ($originOk) {
        Write-Host "CHECK OK: tunnel listo para $target"
    } else {
        Write-Host "CHECK OK: binario resuelto (el origen $target no responde aun)"
    }
    exit 0
}

Write-Host "=== TUNNEL (Ctrl+C para detener) ==="
& $cloudflared tunnel --url $target
exit $LASTEXITCODE
