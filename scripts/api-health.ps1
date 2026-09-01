# api-health.ps1 - Espera hasta que la API responda HTTP 200
# Uso: .\scripts\api-health.ps1
# Retorna exit 0 si health OK, exit 1 si timeout.

$url = "http://localhost:3001/api/v1/health"
$maxAttempts = 30
$delaySeconds = 2

for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "Health OK (intento $i/$maxAttempts) - $($response.Content)"
            exit 0
        }
    } catch {
        # Esperar antes del siguiente intento
    }
    if ($i -lt $maxAttempts) {
        Start-Sleep -Seconds $delaySeconds
    }
}

Write-Host "FAIL: API no respondio health en $maxAttempts intentos ($($maxAttempts * $delaySeconds)s)"
exit 1
