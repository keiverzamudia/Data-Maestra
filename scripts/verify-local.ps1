# verify-local.ps1
# Run: .\scripts\verify-local.ps1

Write-Host ""
Write-Host "=== Data-Maestra - Verificacion Local ===" -ForegroundColor Cyan
Write-Host ""

$passCount = 0
$failCount = 0

# 1. Node
$nodeOk = $false
try { node --version 2>$null | Out-Null; $nodeOk = $true } catch {}
if ($nodeOk) { $passCount++; Write-Host "  [PASS] Node.js" -ForegroundColor Green } else { $failCount++; Write-Host "  [FAIL] Node.js - No encontrado" -ForegroundColor Red }

# 2. pnpm
$pnpmOk = $false
try { pnpm --version 2>$null | Out-Null; $pnpmOk = $true } catch {}
if ($pnpmOk) { $passCount++; Write-Host "  [PASS] pnpm" -ForegroundColor Green } else { $failCount++; Write-Host "  [FAIL] pnpm - No encontrado" -ForegroundColor Red }

# 3. SQLite
$dbPath = Join-Path $PSScriptRoot "..\apps\api\data\dev.db"
if (Test-Path $dbPath) { $passCount++; Write-Host "  [PASS] SQLite DB" -ForegroundColor Green } else { $failCount++; Write-Host "  [FAIL] SQLite DB - No encontrada" -ForegroundColor Red }

# 4. node_modules
$nmPath = Join-Path $PSScriptRoot "..\node_modules"
if (Test-Path $nmPath) { $passCount++; Write-Host "  [PASS] node_modules" -ForegroundColor Green } else { $failCount++; Write-Host "  [FAIL] node_modules - Ejecutar: pnpm install" -ForegroundColor Red }

# 5. API port
$apiPort = $false
try { $c = Test-NetConnection localhost -Port 3001 -WarningAction SilentlyContinue -InformationLevel Quiet; if ($c) { $apiPort = $true } } catch {}
if ($apiPort) { $passCount++; Write-Host "  [PASS] Puerto 3001 (API)" -ForegroundColor Green } else { $failCount++; Write-Host "  [FAIL] Puerto 3001 - Backend no iniciado" -ForegroundColor Red }

# 6. Health
$healthOk = $false
try { Invoke-WebRequest -Uri "http://localhost:3001/api/v1/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop | Out-Null; $healthOk = $true } catch {}
if ($healthOk) { $passCount++; Write-Host "  [PASS] Health API" -ForegroundColor Green } else { $failCount++; Write-Host "  [FAIL] Health API - No responde" -ForegroundColor Red }

# 7. Web port
$webPort = $false
try { $c = Test-NetConnection localhost -Port 5173 -WarningAction SilentlyContinue -InformationLevel Quiet; if ($c) { $webPort = $true } } catch {}
if ($webPort) { $passCount++; Write-Host "  [PASS] Puerto 5173 (Web)" -ForegroundColor Green } else { $failCount++; Write-Host "  [FAIL] Puerto 5173 - Frontend no iniciado" -ForegroundColor Red }

Write-Host ""
Write-Host "Resultado: $passCount PASS / $failCount FAIL" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Yellow" })
Write-Host ""
