# Packs the offline package set for the PAW golden-image build into a single
# archive. Source of truth: corpSetup/WingetRepo/dependencies in this repo
# (on GitHub). The zip is a regenerable build artifact, so it is written to
# the user TEMP folder, NOT committed to the repo.
#
# Run this on the BUILD HOST (the machine that runs packer) whenever the
# contents of corpSetup/WingetRepo/dependencies change:
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File make-packages-zip.ps1
#
# Excludes cp313/cp314 wheels: the golden image installs CPython 3.12 and
# pip ignores wheels built for other Python versions anyway - they are
# dead weight in the upload and in the image.

$ErrorActionPreference = 'Stop'

$src = Join-Path $PSScriptRoot '..\..\WingetRepo\dependencies'
if (-not (Test-Path $src)) { throw "Package folder not found: $src (expected corpSetup/WingetRepo/dependencies in this repo)" }
$src = (Resolve-Path $src).Path
$dst = Join-Path ([IO.Path]::GetTempPath()) 'wingetrepo-packages.zip'

$total = @(Get-ChildItem $src -File)
$totalSize = ($total | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ("Folder: {0} files, {1:N1} MB total" -f $total.Count, $totalSize)

$files = @($total | Where-Object { $_.Name -notmatch 'cp313|cp314' })
$keptSize = ($files | Measure-Object -Property Length -Sum).Sum / 1MB
$excluded = $total.Count - $files.Count
Write-Host ("Zip contents: {0} files, {1:N1} MB ({2} cp313/cp314 wheels excluded)" -f $files.Count, $keptSize, $excluded)

if (Test-Path $dst) { Remove-Item $dst -Force }
Write-Host 'Compressing (may take a minute or two)...'
Compress-Archive -Path $files.FullName -DestinationPath $dst -CompressionLevel Optimal

$zipSize = (Get-Item $dst).Length / 1MB
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead($dst)
try { $entryCount = $z.Entries.Count } finally { $z.Dispose() }
Write-Host ("Created {0}: {1:N1} MB, {2} entries" -f $dst, $zipSize, $entryCount)
Write-Host 'Next: upload-packages.ps1 (creates the storage account if missing,'
Write-Host 'uploads the zip and writes TF_VAR_PACKAGE_URL into the shared .env).'