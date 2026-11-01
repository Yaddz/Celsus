# scripts/build-gomobile-android.ps1
# Automates compiling pkg/mobilebridge into Android .aar library via gomobile bind

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\..").Path
$serviceDir = Join-Path $rootDir "services\market-api"
$outputAar = Join-Path $rootDir "apps\mobile\modules\celsus-market\android\libs\celsusmarket.aar"

Write-Host ">>> Configuring environment for gomobile..."
if (-not $env:ANDROID_HOME) {
    $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
}

if (-not $env:ANDROID_NDK_HOME) {
    $ndkDirs = Get-ChildItem "$env:ANDROID_HOME\ndk" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
    if ($ndkDirs.Count -gt 0) {
        $env:ANDROID_NDK_HOME = $ndkDirs[0].FullName
    }
}

$gopath = go env GOPATH
if ($env:PATH -notlike "*$gopath\bin*") {
    $env:PATH = "$gopath\bin;$env:PATH"
}

Write-Host "ANDROID_HOME: $env:ANDROID_HOME"
Write-Host "ANDROID_NDK_HOME: $env:ANDROID_NDK_HOME"
Write-Host "Compiling celsusmarket.aar..."

Push-Location $serviceDir
try {
    gomobile bind -target=android -androidapi 24 -o $outputAar ./pkg/mobilebridge
    if ($LASTEXITCODE -ne 0) {
        throw "gomobile bind failed with exit code $LASTEXITCODE"
    }
    Write-Host ">>> Successfully generated $outputAar"
}
finally {
    Pop-Location
}
