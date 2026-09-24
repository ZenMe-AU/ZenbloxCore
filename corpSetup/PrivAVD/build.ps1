$ErrorActionPreference = "Stop"

$buildDirectory = Join-Path $PSScriptRoot "buildImage"
$buildScript = Join-Path $buildDirectory "build.ps1"

Push-Location $buildDirectory
try {
    & $buildScript @args
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
