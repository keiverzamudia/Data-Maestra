# _worktree.ps1 - Configuracion de puertos por worktree (se usa con dot-source).
#
#   . "$PSScriptRoot\_worktree.ps1"
#
# Lee <repoRoot>/.env.local (no versionado) y expone:
#   $ApiPort  -> puerto de la API  (API_PORT, default 3001)
#   $WebPort  -> puerto de Vite    (WEB_PORT, default 5173)
#   $RepoRoot -> raiz del worktree
# Si el archivo no existe, se conservan los defaults historicos.

$RepoRoot = Split-Path $PSScriptRoot -Parent
$WorktreeEnvFile = Join-Path $RepoRoot ".env.local"

$ApiPort = 3001
$WebPort = 5173

if (Test-Path -LiteralPath $WorktreeEnvFile) {
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
