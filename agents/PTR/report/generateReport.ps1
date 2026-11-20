param(
	[string]$In,
	[string]$Out,
	[switch]$NoHost
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$generatorArgs = @()
if ($In) { $generatorArgs += @('--in', $In) }
if ($Out) { $generatorArgs += @('--out', $Out) }
if ($NoHost) { $generatorArgs += '--no-host' }

& npx --yes tsx (Join-Path $scriptDir 'generateReport.ts') @generatorArgs
exit $LASTEXITCODE
