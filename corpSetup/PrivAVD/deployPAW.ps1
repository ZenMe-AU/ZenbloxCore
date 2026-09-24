$ErrorActionPreference = "Stop"

$deployDirectory = Join-Path $PSScriptRoot "deployPaw"
$deployScript = Join-Path $deployDirectory "deployPAW.ps1"

Push-Location $deployDirectory
try {
    & $deployScript @args
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
