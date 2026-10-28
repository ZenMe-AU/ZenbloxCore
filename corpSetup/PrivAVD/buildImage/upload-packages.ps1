# Uploads the offline package archive to Azure Blob Storage and writes the
# read-only SAS URL into the shared .env (TF_VAR_PACKAGE_URL) so build.ps1
# can pass it to Packer as the PACKAGE_URL variable.
#
# Run AFTER make-packages-zip.ps1 whenever the package set changes:
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File upload-packages.ps1
#
# Requires: az CLI logged in
#   az login --tenant "x5fb0613-7977-455x-80xb-6aadac82424x"
# and an active PIM role with Contributor/Owner on the gallery resource
# group (same activation needed for builds).
#
# Why: bulk WinRM uploads (Packer file provisioner) hung the build twice -
# a 68-file directory walk AND a single 53 MB zip. The build VM now
# downloads the archive from Azure Storage over the intra-Azure path
# (seconds, with progress output in the install provisioner) instead.
#
# Auth notes: ALL data-plane calls (container/blob) use the storage ACCOUNT
# KEY, not --auth-mode login. The storage data-plane OAuth token is a
# separate credential from the ARM token and its WAM cache entry goes stale
# constantly on this box (ARM works while --auth-mode login dies with
# "token that does not exist"). The key is fetched via the ARM plane, which
# works with the ordinary az login.

# Continue (not Stop): with ErrorActionPreference=Stop, PowerShell 5.1 over
# SSH wraps native stderr (az error text) into a terminating
# NativeCommandError before our explicit $LASTEXITCODE checks can run.
# Every az call below is checked via $LASTEXITCODE with a named error.
$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

# Load KEY=VALUE pairs from the shared PrivAVD .env (same parser as build.ps1).
Get-Content (Join-Path $PSScriptRoot "..\.env") | ForEach-Object {
    if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
        Set-Variable -Name $Matches[1].Trim() -Value $Matches[2].Trim()
    }
}

$accountName    = "zenwingetpackages"   # globally unique, lowercase, no hyphens
$container      = "wingetrepo"
$blobName       = "wingetrepo-packages.zip"
$zipPath        = Join-Path $env:TEMP 'wingetrepo-packages.zip'
$resourceGroup  = $TF_VAR_GALLERY_RG
$location       = $TF_VAR_PAW_LOCATION

if ([string]::IsNullOrWhiteSpace($resourceGroup) -or [string]::IsNullOrWhiteSpace($location)) {
    throw "TF_VAR_GALLERY_RG / TF_VAR_PAW_LOCATION missing in .env"
}
if (-not (Test-Path $zipPath)) {
    throw "Archive not found: $zipPath. Run make-packages-zip.ps1 first."
}

Write-Host ">> Ensuring storage account $accountName in $resourceGroup ($location)"
az storage account create --name $accountName --resource-group $resourceGroup --location $location --sku Standard_LRS --kind StorageV2 --only-show-errors
if ($LASTEXITCODE -ne 0) { throw "az storage account create failed. Is az logged in with an active PIM role? (az login --tenant 15fb0613-7977-4551-801b-6aadac824241)" }

Write-Host ">> Getting storage account key"
$key = az storage account keys list --account-name $accountName --resource-group $resourceGroup --query "[0].value" --output tsv
if ($LASTEXITCODE -ne 0) { throw "az storage account keys list failed" }

Write-Host ">> Ensuring container $container"
$containers = az storage container list --account-name $accountName --account-key $key --query "[].name" --output tsv
if ($LASTEXITCODE -ne 0) { throw "az storage container list failed" }
if (@($containers) -notcontains $container) {
    az storage container create --account-name $accountName --account-key $key --name $container
    if ($LASTEXITCODE -ne 0) { throw "az storage container create failed" }
    Write-Host "   Container created: $container"
} else {
    Write-Host "   Container already exists: $container"
}

Write-Host ">> Uploading $zipPath"
$zipMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
$uploadStart = Get-Date
az storage blob upload --account-name $accountName --account-key $key --container-name $container --name $blobName --file $zipPath --overwrite
if ($LASTEXITCODE -ne 0) { throw "az storage blob upload failed" }
Write-Host ("   Uploaded {0} MB in {1}s" -f $zipMb, [int]((Get-Date) - $uploadStart).TotalSeconds)

Write-Host ">> Minting read-only SAS URL (valid 1 year, HTTPS only)"
$expiry = (Get-Date).ToUniversalTime().AddYears(1).ToString("yyyy-MM-dd")
$sas = az storage blob generate-sas --account-name $accountName --account-key $key --container-name $container --name $blobName --permissions r --expiry $expiry --https-only --output tsv
if ($LASTEXITCODE -ne 0) { throw "az storage blob generate-sas failed" }
# NB: ${blobName} must be braced - in PowerShell "$blobName?" parses as the
# variable name "blobName?" (question mark is a valid variable-name
# character), which is undefined, silently deleting the blob name AND the
# "?" separator from the URL. This exact bug shipped a broken .env line
# (HTTP 409 on the build VM) on 2026-10-27.
$url = "https://$accountName.blob.core.windows.net/$container/${blobName}?$sas"

Write-Host ">> Verifying the SAS URL (HTTP HEAD)"
try {
    $probe = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 60
    # Content-Length arrives as a string[] array - index out the scalar and
    # parse defensively. Never cast the header array directly: in pwsh 7
    # [double]$Headers.'Content-Length' throws "Cannot convert
    # System.String[]" and would abort the whole upload here (the size
    # display must never be able to fail the pipeline).
    $sizeNote = ''
    $rawLen = @($probe.Headers.'Content-Length')[0]
    if ($rawLen) {
        $len = 0.0
        if ([double]::TryParse("$rawLen", [ref]$len)) { $sizeNote = ", blob is {0:N1} MB" -f ($len / 1MB) }
    }
    Write-Host ("   HTTP {0} - URL verified{1}" -f $probe.StatusCode, $sizeNote)
} catch {
    throw "SAS URL verification FAILED - the URL written to .env would not download: $_"
}

Write-Host ">> Writing TF_VAR_PACKAGE_URL into the shared .env"
$envPath = Join-Path $PSScriptRoot "..\.env"
$lines = @(Get-Content $envPath)
$updated = $false
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*TF_VAR_PACKAGE_URL=') {
        $lines[$i] = "TF_VAR_PACKAGE_URL=$url"
        $updated = $true
        break
    }
}
if (-not $updated) { $lines += "TF_VAR_PACKAGE_URL=$url" }
Set-Content -Path $envPath -Value $lines

Write-Host "UPLOAD COMPLETE" -ForegroundColor Green
Write-Host "  Blob   : https://$accountName.blob.core.windows.net/$container/$blobName"
Write-Host "  SAS URL written to .env (TF_VAR_PACKAGE_URL), expires $expiry"
Write-Host "  Next   : .\build.ps1"