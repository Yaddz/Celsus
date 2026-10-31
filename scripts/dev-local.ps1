<#
.SYNOPSIS
    Script de Inicialização do Ambiente Local Integrado Celsus (Go Backend + Expo Mobile).
.DESCRIPTION
    1. Compila e inicia o backend Go de mercado (services/market-api) na porta 8080 com banco populado via seed.
    2. Aguarda a validação de health check (/v1/health).
    3. Configura a variável de ambiente EXPO_PUBLIC_MARKET_API_URL.
    4. Inicia o app mobile Expo em apps/mobile.
#>

param(
    [string]$MarketApiPort = "8080",
    [switch]$NoMobile = $false
)

$ErrorActionPreference = "Stop"
$WorkspaceRoot = Split-Path -Parent $PSScriptRoot
$MarketApiDir = Join-Path $WorkspaceRoot "services/market-api"
$MobileDir = Join-Path $WorkspaceRoot "apps/mobile"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   CELSUS — AMBIENTE LOCAL INTEGRADO FRONT + BACK         " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Iniciar Backend Go
Write-Host "[1/3] Iniciando Backend de Mercado Go (services/market-api)..." -ForegroundColor Yellow
$goProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$MarketApiDir'; `$env:PORT='$MarketApiPort'; go run ." -PassThru

# 2. Aguardar health check
Write-Host "[2/3] Aguardando inicialização do servidor Go na porta $MarketApiPort..." -ForegroundColor Yellow
$healthUrl = "http://localhost:$MarketApiPort/v1/health"
$maxAttempts = 15
$attempt = 0
$serverReady = $false

while ($attempt -lt $maxAttempts -and -not $serverReady) {
    Start-Sleep -Seconds 1
    $attempt++
    try {
        $res = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 2 -ErrorAction Stop
        if ($res.status -eq "ok") {
            $serverReady = $true
            Write-Host " -> Backend Go pronto e saudável! (Última data cotahist: $($res.cotahist_last_date))" -ForegroundColor Green
        }
    } catch {
        Write-Host " -> Tentativa $attempt/$maxAttempts: aguardando resposta de $healthUrl..." -ForegroundColor DarkGray
    }
}

if (-not $serverReady) {
    Write-Host "[AVISO] Não foi possível confirmar /v1/health dentro do tempo limite. O backend pode estar compilando na outra janela." -ForegroundColor Yellow
}

if ($NoMobile) {
    Write-Host "[INFO] Flag -NoMobile ativada. Encerrando script com backend em execução." -ForegroundColor Cyan
    exit 0
}

# 3. Iniciar Expo Mobile
Write-Host "[3/3] Iniciando App Mobile Expo com EXPO_PUBLIC_MARKET_API_URL=http://localhost:$MarketApiPort..." -ForegroundColor Yellow
$env:EXPO_PUBLIC_MARKET_API_URL = "http://localhost:$MarketApiPort"
Set-Location -Path $MobileDir
npm start
