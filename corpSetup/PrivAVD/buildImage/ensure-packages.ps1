# Makes sure the offline package archive exists in Azure Blob Storage before
# a build starts. If the blob is missing - storage account deleted to free
# resources, SAS expired, or a fresh clone with an empty TF_VAR_PACKAGE_URL -
# everything is rebuilt automatically:
#
#   corpSetup/WingetRepo/dependencies  ->  make-packages-zip.ps1  ->  TEMP zip
#   TEMP zip                           ->  upload-packages.ps1   ->  blob + fresh SAS -> .env
#
# Called by build.ps1 before every build; also fine to run manually:
#   powershell -NoProfile -ExecutionPolicy Bypass -File ensure-packages.ps1

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

function Read-PackageUrl {
    # Read TF_VAR_PACKAGE_URL from the shared PrivAVD .env (same parser as build.ps1).
    $envPath = Join-Path $PSScriptRoot '..\.env'
    if (-not (Test-Path $envPath)) { return $null }
    $url = $null
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^\s*TF_VAR_PACKAGE_URL\s*=\s*(.+)$') { $url = $Matches[1].Trim() }
    }
    return $url
}

function Test-BlobReachable {
    param([string]$Url)
    if ([string]::IsNullOrWhiteSpace($Url)) { return $false }
    try {
        $probe = Invoke-WebRequest -Uri $Url -Method Head -UseBasicParsing -TimeoutSec 15
        return ($probe.StatusCode -eq 200)
    } catch {
        # DNS failure (account deleted), 404 (blob/account gone), 403 (SAS
        # expired) - all mean "rebuild". A rebuild is harmless even if the
        # failure was transient: upload --overwrite just re-uploads the same
        # zip and mints a fresh SAS.
        return $false
    }
}

$url = Read-PackageUrl
if (Test-BlobReachable -Url $url) {
    Write-Host '>> Package blob reachable (HTTP 200) - nothing to do.' -ForegroundColor Green
    return
}

if ([string]::IsNullOrWhiteSpace($url)) {
    Write-Host '>> TF_VAR_PACKAGE_URL missing in .env - rebuilding package blob.'
} else {
    Write-Host ">> Package blob unreachable ($url) - rebuilding package blob."
}

& (Join-Path $PSScriptRoot 'make-packages-zip.ps1')
& (Join-Path $PSScriptRoot 'upload-packages.ps1')

# upload-packages.ps1 HEAD-verifies the URL it writes; verify once more from
# here so a build never starts against an unverified URL.
$url = Read-PackageUrl
if (-not (Test-BlobReachable -Url $url)) {
    throw "Package blob still unreachable after rebuild - see upload-packages.ps1 output above."
}
Write-Host 'PACKAGE BLOB READY' -ForegroundColor Green