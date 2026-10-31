param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("lock", "verify", "unlock", "status")]
    [string]$Action
)

$ErrorActionPreference = "Stop"
$WorkspaceRoot = Split-Path -Parent $PSScriptRoot
$LockFilePath = Join-Path $WorkspaceRoot "tests.lock.json"

function Get-TestFiles {
    Get-ChildItem -Path $WorkspaceRoot -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
        $_.FullName -notmatch "\\node_modules\\|\\\.git\\|\\dist\\|\\build\\|\\\.expo\\" -and
        ($_.Name -match "_test\.go$" -or $_.Name -match "\.(test|spec)\.(ts|tsx|js|jsx)$")
    }
}

function Get-RelativePath([string]$FullPath) {
    return $FullPath.Substring($WorkspaceRoot.Length + 1).Replace("\", "/")
}

if ($Action -eq "lock") {
    $files = Get-TestFiles
    $entries = [ordered]@{}

    foreach ($file in $files) {
        $relPath = Get-RelativePath $file.FullName
        $hash = (Get-FileHash -Path $file.FullName -Algorithm SHA256).Hash.ToLower()
        $file.IsReadOnly = $true
        $entries[$relPath] = [ordered]@{
            sha256 = $hash
            lockedAt = (Get-Date).ToString("o")
            sizeBytes = $file.Length
        }
    }

    $lockPayload = [ordered]@{
        protocol = "CELSUS_IMMUTABLE_TDD_LOCK_V1"
        updatedAt = (Get-Date).ToString("o")
        totalLockedFiles = $files.Count
        files = $entries
    }

    if (Test-Path $LockFilePath) {
        Set-ItemProperty -Path $LockFilePath -Name IsReadOnly -Value $false
    }
    $lockPayload | ConvertTo-Json -Depth 5 | Set-Content -Path $LockFilePath -Encoding UTF8
    Set-ItemProperty -Path $LockFilePath -Name IsReadOnly -Value $true

    Write-Host "[TDD LOCK] $($files.Count) arquivo(s) de teste bloqueado(s) com ReadOnly e registrados em tests.lock.json." -ForegroundColor Green
    exit 0
}

if ($Action -eq "verify") {
    if (-not (Test-Path $LockFilePath)) {
        Write-Error "[TDD VIOLATION] Arquivo tests.lock.json nao encontrado! Execute a Fase A (-Action lock) antes de implementar."
        exit 1
    }

    $lockData = Get-Content -Path $LockFilePath -Raw | ConvertFrom-Json
    $violations = @()

    foreach ($prop in $lockData.files.PSObject.Properties) {
        $relPath = $prop.Name
        $expectedHash = $prop.Value.sha256
        $fullPath = Join-Path $WorkspaceRoot ($relPath.Replace("/", "\"))

        if (-not (Test-Path $fullPath)) {
            $violations += "REMOVIDO: $relPath foi deletado!"
            continue
        }

        $actualHash = (Get-FileHash -Path $fullPath -Algorithm SHA256).Hash.ToLower()
        if ($actualHash -ne $expectedHash) {
            $violations += "ADULTERADO: $relPath teve seu conteudo modificado! (Esperado: $expectedHash | Atual: $actualHash)"
        }
    }

    if ($violations.Count -gt 0) {
        Write-Host "================================================================" -ForegroundColor Red
        Write-Host "[SECURITY PROTOCOL: TDD LOCK VIOLATION DETECTED]" -ForegroundColor Red
        Write-Host "O agente alterou arquivos de teste bloqueados! Reverta os testes e corrija o CODIGO DE PRODUCAO." -ForegroundColor Red
        foreach ($v in $violations) {
            Write-Host " - $v" -ForegroundColor Red
        }
        Write-Host "================================================================" -ForegroundColor Red
        exit 1
    }

    Write-Host "[TDD VERIFIED] Integridade de todos os $($lockData.totalLockedFiles) arquivos de teste confirmada via SHA-256." -ForegroundColor Green
    exit 0
}

if ($Action -eq "unlock") {
    $files = Get-TestFiles
    foreach ($file in $files) {
        $file.IsReadOnly = $false
    }
    if (Test-Path $LockFilePath) {
        Set-ItemProperty -Path $LockFilePath -Name IsReadOnly -Value $false
    }
    Write-Host "[TDD UNLOCK] Arquivos de teste desbloqueados para escrita de novos testes (Fase A)." -ForegroundColor Yellow
    exit 0
}

if ($Action -eq "status") {
    if (-not (Test-Path $LockFilePath)) {
        Write-Host "[TDD STATUS] Nenhum lock ativo ainda (tests.lock.json ausente)." -ForegroundColor Yellow
        exit 0
    }
    $lockData = Get-Content -Path $LockFilePath -Raw | ConvertFrom-Json
    Write-Host "[TDD STATUS] Lock ativo desde $($lockData.updatedAt) com $($lockData.totalLockedFiles) arquivo(s) protegido(s)." -ForegroundColor Cyan
    exit 0
}
