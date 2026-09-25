$ErrorActionPreference = "Stop"

$initDirectory = Join-Path $PSScriptRoot "initImageGallery"
$initScript = Join-Path $initDirectory "init.ps1"

Push-Location $initDirectory
try {
    & $initScript @args
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
