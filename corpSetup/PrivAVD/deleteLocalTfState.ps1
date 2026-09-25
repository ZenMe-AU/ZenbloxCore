# This script deletes Terraform State files in the local folder and subfolder, it doesn't touch remote files.
[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$stateFiles = @(
    Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -Force -File |
    Where-Object { $_.Name -in @("terraform.tfstate", "terraform.tfstate.backup") }
)

if ($stateFiles.Count -eq 0) {
    Write-Host "No Terraform state files were found under $PSScriptRoot."
    return
}

Write-Host "The following Terraform state files will be permanently deleted:"
$stateFiles |
ForEach-Object { $_.FullName.Substring($PSScriptRoot.Length).TrimStart("\") } |
Sort-Object |
ForEach-Object { Write-Host "  $_" }

if (-not $Force) {
    $confirmation = Read-Host "Type DELETE to continue"
    if ($confirmation -ine "DELETE") {
        Write-Host "Terraform state deletion cancelled."
        return
    }
}

$stateFiles | Remove-Item -Force
Write-Host "Deleted $($stateFiles.Count) Terraform state file(s)."
