# _worktree.ps1 - Configuracion de puertos por worktree (se usa con dot-source).
#
#   . "$PSScriptRoot\_worktree.ps1"
#
# Lee <repoRoot>/.env.local (no versionado) y expone:
#   $ApiPort           -> puerto de la API  (API_PORT, default 3001)
#   $WebPort           -> puerto de Vite    (WEB_PORT, default 5173)
#   $RepoRoot          -> raiz del worktree
#   $WorktreeEnvSource -> de donde salieron los puertos (archivo o defaults)
#   $WorktreeApiMain   -> ruta completa a apps\api\dist\main.js de ESTE worktree
# Si el archivo no existe, se conservan los defaults historicos.

$RepoRoot = Split-Path $PSScriptRoot -Parent
$WorktreeEnvFile = Join-Path $RepoRoot ".env.local"
$WorktreeApiMain = Join-Path (Join-Path (Join-Path $RepoRoot "apps") "api") "dist\main.js"

$ApiPort = 3001
$WebPort = 5173
$WorktreeEnvSource = "(sin .env.local: defaults API_PORT=3001 WEB_PORT=5173)"

if (Test-Path -LiteralPath $WorktreeEnvFile) {
    $WorktreeEnvSource = $WorktreeEnvFile
    foreach ($line in Get-Content -LiteralPath $WorktreeEnvFile) {
        $text = $line.Trim()
        if (-not $text -or $text.StartsWith('#')) { continue }
        $sep = $text.IndexOf('=')
        if ($sep -le 0) { continue }
        $key = $text.Substring(0, $sep).Trim()
        $value = $text.Substring($sep + 1).Trim().Trim('"')
        if ($key -eq 'API_PORT' -and $value -match '^\d+$') { $ApiPort = [int]$value }
        if ($key -eq 'WEB_PORT' -and $value -match '^\d+$') { $WebPort = [int]$value }
    }
}

function Get-WorktreeApiProcess {
    # Procesos node que ejecutan el dist\main.js DE ESTE worktree, aunque estén
    # en otro puerto (con o sin extensión .js, con o sin comillas).
    # No toca instancias de otros worktrees, ni vite, ni nest --watch, ni prisma.
    $norm = ($WorktreeApiMain -replace '/', '\')
    $noExt = [System.IO.Path]::ChangeExtension($norm, $null).TrimEnd('.')
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $cmd = $_.CommandLine
            if (-not $cmd) { return $false }
            $c = $cmd.Replace('/', '\')
            $i = $c.IndexOf($noExt, [System.StringComparison]::OrdinalIgnoreCase)
            while ($i -ge 0) {
                if ($c.Substring($i + $noExt.Length) -match '^(\.js)?("|\s|$)') { return $true }
                $i = $c.IndexOf($noExt, $i + 1, [System.StringComparison]::OrdinalIgnoreCase)
            }
            return $false
        }
}
