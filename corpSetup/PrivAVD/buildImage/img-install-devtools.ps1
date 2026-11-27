#requires -RunAsAdministrator
# Installs the PAW developer tools into the golden image, for all users:
# Visual Studio Code, Node.js LTS with npm, pnpm, Git for Windows, Terraform.
# Idempotent, so it can be run directly on a test VM before a Packer build.
#
# Why at build time: the Packer build VM is the image's only internet-connected
# moment. A deployed PAW is born locked, so every tool is downloaded, verified
# and installed here. Nothing is installed on running PAWs.
#
# Trust: every download must match the checksum pinned in $DevTools (SHA-256;
# SHA-512 for the pnpm tarball), and the Windows installers must carry a valid
# Authenticode signature from the expected publisher. Any mismatch fails the
# build. Where the pins come from:
#   VS Code    Microsoft's update service (update.code.visualstudio.com/api)
#   Node.js    SHASUMS256.txt, signed by the Node.js release team
#   pnpm       the npm registry's sha512 integrity; identical to the
#              packageManager pin in ZBApp's package.json
#   Git        the GitHub release asset digest (git-for-windows/git)
#   Terraform  terraform_<version>_SHA256SUMS, signed by HashiCorp
#
# Switch: INSTALL_DEV_TOOLS (Packer variable; TF_VAR_INSTALL_DEV_TOOLS in the
# shared .env; build.ps1 passes it). Default true; false exits at once.
#
# Bumping a version: change Version, Url, File and the checksum of that entry
# together, from the sources above, then run a test build. pnpm must match the
# packageManager field of the projects used on the PAW (ZBApp: pnpm@11.22.0).
#
# Not set here: where npm/pnpm, Terraform and VS Code fetch packages, providers
# and extensions, and which certificate authority they trust. Those differ per
# environment and are deploy-time settings.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Phase([string]$message) {
    Write-Host ">> $message" -ForegroundColor Cyan
}

if ("$env:INSTALL_DEV_TOOLS".Trim().ToLowerInvariant() -eq 'false') {
    Write-Host "Developer tools: switched off (INSTALL_DEV_TOOLS=false) - nothing to install."
    exit 0
}

$DevTools = [ordered]@{
    VSCode    = @{
        Version   = '1.148.0'
        Url       = 'https://update.code.visualstudio.com/1.148.0/win32-x64/stable'
        File      = 'VSCodeSetup-x64-1.148.0.exe'
        Sha256    = '80e3c1814125f141afd5e196c22a831abfc5fdf4ee4087cf6b08c692e649f79c'
        Publisher = 'Microsoft Corporation'
    }
    Node      = @{
        Version   = '24.22.3'
        Url       = 'https://nodejs.org/dist/v24.22.3/node-v24.22.3-x64.msi'
        File      = 'node-v24.22.3-x64.msi'
        Sha256    = '4a1ab5bdec5434bae58efae6c3e5077a011f6f1e76d2b47b7b10af043f7db545'
        Publisher = 'OpenJS Foundation'
    }
    Pnpm      = @{
        Version = '11.22.0'
        Url     = 'https://registry.npmjs.org/pnpm/-/pnpm-11.22.0.tgz'
        File    = 'pnpm-11.22.0.tgz'
        Sha512  = '1ff870c4c6133dfd88fb2afc46dd13d47f09c9794b438c6fdb47ca98caf3bc16381ee0be93a091b8e3824cf01f889f46d7d9e20910fb0be1ab0fb5baa80dd621'
    }
    Git       = @{
        Version   = '2.56.1'
        Url       = 'https://github.com/git-for-windows/git/releases/download/v2.56.1.windows.1/Git-2.56.1-64-bit.exe'
        File      = 'Git-2.56.1-64-bit.exe'
        Sha256    = 'c330c72e10b408cc39994bfefdb63542b0d93d21699325c3e0bd874af8a5a559'
        Publisher = 'Johannes Schindelin'
    }
    Terraform = @{
        Version = '1.17.2'
        Url     = 'https://releases.hashicorp.com/terraform/1.17.2/terraform_1.17.2_windows_amd64.zip'
        File    = 'terraform_1.17.2_windows_amd64.zip'
        Sha256  = '2244b7a379ea8c4b224a2eab411b7288f41ef36316fca27ae4b51b1cf2a53024'
    }
}

$work = Join-Path $env:SystemRoot 'Temp\paw-devtools'
$logDir = Join-Path $env:SystemRoot 'Temp'
$nodeDir = Join-Path $env:ProgramFiles 'nodejs'
$codeExe = Join-Path $env:ProgramFiles 'Microsoft VS Code\Code.exe'
$gitExe = Join-Path $env:ProgramFiles 'Git\cmd\git.exe'
$terraformDir = Join-Path $env:ProgramFiles 'Terraform'
$terraformExe = Join-Path $terraformDir 'terraform.exe'

# --- helpers ---------------------------------------------------------------

# Native tools write progress and warnings to stderr. Under Packer's WinRM
# session, Stop would turn that into a terminating error before the exit code
# is checked, so native commands run with Continue and an explicit check.
function Invoke-Native([string]$filePath, [string[]]$argumentList) {
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $filePath @argumentList 2>&1 | ForEach-Object { Write-Host "    $_" }
        $code = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $eap }
    if ($code -ne 0) { throw "$(Split-Path $filePath -Leaf) $($argumentList -join ' ') exited with code $code" }
}

function Get-NativeOutput([string]$filePath, [string[]]$argumentList) {
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $filePath @argumentList 2>$null
        $code = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $eap }
    if ($code -ne 0) { throw "$(Split-Path $filePath -Leaf) $($argumentList -join ' ') exited with code $code" }
    return ((@($out) -join "`n").Trim())
}

function Start-Installer([string]$filePath, [string]$arguments, [string]$logFile, [int[]]$okExitCodes = @(0)) {
    $p = Start-Process -FilePath $filePath -ArgumentList $arguments -Wait -PassThru -NoNewWindow
    if ($okExitCodes -notcontains $p.ExitCode) {
        if ($logFile -and (Test-Path $logFile)) {
            Write-Host "  last lines of $logFile :"
            Get-Content $logFile -Tail 30 | ForEach-Object { Write-Host "    $_" }
        }
        throw "$(Split-Path $filePath -Leaf) exited with code $($p.ExitCode)"
    }
    Write-Host "  installer exit code $($p.ExitCode)"
}

# Download once, then refuse the file unless its checksum (and, for Windows
# installers, its publisher signature) matches the pin.
function Get-VerifiedDownload([string]$name) {
    $t = $DevTools[$name]
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    $path = Join-Path $work $t.File
    if (-not (Test-Path $path)) {
        Write-Host "  downloading $($t.Url)"
        Invoke-WebRequest -Uri $t.Url -OutFile $path -UseBasicParsing
    }
    if ($t.Sha512) { $alg = 'SHA512'; $want = $t.Sha512 } else { $alg = 'SHA256'; $want = $t.Sha256 }
    $got = (Get-FileHash -Path $path -Algorithm $alg).Hash.ToLowerInvariant()
    if ($got -ne $want.ToLowerInvariant()) {
        Remove-Item $path -Force
        throw "$($t.File): $alg mismatch (pinned $want, downloaded $got) - file rejected"
    }
    Write-Host ("  {0} matches the pin: {1} ({2:N1} MB)" -f $alg, $t.File, ((Get-Item $path).Length / 1MB))
    if ($t.Publisher) {
        $sig = Get-AuthenticodeSignature -FilePath $path
        $subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { '(unsigned)' }
        if ($sig.Status -ne 'Valid' -or $subject -notmatch [regex]::Escape($t.Publisher)) {
            throw "$($t.File): signature is not a valid '$($t.Publisher)' signature (status $($sig.Status), signer $subject)"
        }
        Write-Host "  signature valid: $subject"
    }
    return $path
}

# Append to the machine PATH without flattening it: the value is REG_EXPAND_SZ
# with %SystemRoot%-style entries, which [Environment]::SetEnvironmentVariable
# would rewrite as plain REG_SZ.
function Add-MachinePath([string]$directory) {
    $key = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\CurrentControlSet\Control\Session Manager\Environment', $true)
    try {
        $raw = $key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        $parts = @($raw -split ';' | Where-Object { $_ })
        if (@($parts | Where-Object { $_.TrimEnd('\') -ieq $directory.TrimEnd('\') }).Count -gt 0) {
            Write-Host "  machine PATH already contains $directory"
            return
        }
        $key.SetValue('Path', (($parts + $directory) -join ';'), [Microsoft.Win32.RegistryValueKind]::ExpandString)
        Write-Host "  added to machine PATH: $directory"
    }
    finally { $key.Close() }
}

function Set-MachineVariable([string]$name, [string]$value) {
    [Environment]::SetEnvironmentVariable($name, $value, 'Machine')
    Set-Item -Path "env:$name" -Value $value
    Write-Host "  machine variable $name = $value"
}

# File versions may carry a fourth part (1.148.0.0); compare major.minor.build.
function Test-SameVersion([string]$got, [string]$want) {
    $g = $null; $w = $null
    if (-not [version]::TryParse(($got -replace '^v', ''), [ref]$g)) { return $false }
    if (-not [version]::TryParse(($want -replace '^v', ''), [ref]$w)) { return $false }
    return ($g.Major -eq $w.Major -and $g.Minor -eq $w.Minor -and $g.Build -eq $w.Build)
}

function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ';'
}

# --- phases ----------------------------------------------------------------

function Install-VSCode {
    $t = $DevTools.VSCode
    Write-Phase "Visual Studio Code $($t.Version) (all users)"
    if ((Test-Path $codeExe) -and (Test-SameVersion (Get-Item $codeExe).VersionInfo.ProductVersion $t.Version)) {
        Write-Host "  already installed"
        return
    }
    $setup = Get-VerifiedDownload 'VSCode'
    $log = Join-Path $logDir 'paw-devtools-vscode.log'
    Start-Installer $setup "/VERYSILENT /NORESTART /SUPPRESSMSGBOXES /MERGETASKS=!runcode,addcontextmenufiles,addcontextmenufolders,associatewithfiles,addtopath /LOG=`"$log`"" $log
}

function Set-VSCodePolicy {
    Write-Phase "Visual Studio Code policies: no self-update, no telemetry"
    $k = 'HKLM:\SOFTWARE\Policies\Microsoft\VSCode'
    New-Item -Path $k -Force | Out-Null
    Set-ItemProperty -Path $k -Name UpdateMode -Value 'none' -Type String
    Set-ItemProperty -Path $k -Name TelemetryLevel -Value 'off' -Type String
    Write-Host "  UpdateMode = none (new versions arrive with a new image), TelemetryLevel = off"
}

function Install-Node {
    $t = $DevTools.Node
    Write-Phase "Node.js $($t.Version) LTS with npm (all users)"
    $nodeExe = Join-Path $nodeDir 'node.exe'
    if ((Test-Path $nodeExe) -and (Test-SameVersion (Get-Item $nodeExe).VersionInfo.ProductVersion $t.Version)) {
        Write-Host "  already installed"
        return
    }
    $msi = Get-VerifiedDownload 'Node'
    $log = Join-Path $logDir 'paw-devtools-node.log'
    Start-Installer (Join-Path $env:SystemRoot 'System32\msiexec.exe') "/i `"$msi`" /qn /norestart /l*v `"$log`"" $log @(0, 3010)
}

function Install-Pnpm {
    $t = $DevTools.Pnpm
    Write-Phase "pnpm $($t.Version) (all users, from the verified tarball)"
    $pkg = Join-Path $nodeDir 'node_modules\pnpm\package.json'
    if ((Test-Path $pkg) -and ((Get-Content $pkg -Raw | ConvertFrom-Json).version -eq $t.Version)) {
        Write-Host "  already installed"
        return
    }
    $tgz = Get-VerifiedDownload 'Pnpm'
    # --prefix puts the package and its pnpm/pnpx commands next to node.exe:
    # on the machine PATH and read-only for standard users. Installing the
    # local tarball means npm does not resolve pnpm from the registry.
    Invoke-Native (Join-Path $nodeDir 'npm.cmd') @('install', '--global', '--prefix', $nodeDir, '--no-audit', '--no-fund', '--no-update-notifier', '--loglevel=error', $tgz)
}

function Install-Git {
    $t = $DevTools.Git
    Write-Phase "Git for Windows $($t.Version) (all users)"
    if (Test-Path $gitExe) {
        $v = (Get-NativeOutput $gitExe @('--version')) -replace '^git version\s+', ''
        if ($v -like "$($t.Version).windows.*") {
            Write-Host "  already installed ($v)"
            return
        }
    }
    $setup = Get-VerifiedDownload 'Git'
    # Installer answers: git on PATH for cmd, PowerShell and other tools; VS Code
    # as the editor (friendlier than vim for people who avoid the command
    # line); main as the default branch; the Windows certificate store for
    # HTTPS, so a certificate authority trusted by the PAW is trusted by git.
    $inf = Join-Path $work 'git-install.inf'
    @('[Setup]', 'PathOption=Cmd', 'EditorOption=VisualStudioCode', 'DefaultBranchOption=main', 'CURLOption=WinSSL') |
        Set-Content -Path $inf -Encoding ASCII
    $log = Join-Path $logDir 'paw-devtools-git.log'
    Start-Installer $setup "/VERYSILENT /NORESTART /NOCANCEL /SP- /SUPPRESSMSGBOXES /CLOSEAPPLICATIONS /LOADINF=`"$inf`" /LOG=`"$log`"" $log
    # Deep node_modules trees exceed 260 characters; let git handle them.
    Invoke-Native $gitExe @('config', '--system', 'core.longpaths', 'true')
}

function Install-Terraform {
    $t = $DevTools.Terraform
    Write-Phase "Terraform $($t.Version) (all users)"
    $env:CHECKPOINT_DISABLE = '1'
    if (Test-Path $terraformExe) {
        $v = ((Get-NativeOutput $terraformExe @('version', '-json')) | ConvertFrom-Json).terraform_version
        if ($v -eq $t.Version) {
            Write-Host "  already installed"
            Add-MachinePath $terraformDir
            return
        }
    }
    $zip = Get-VerifiedDownload 'Terraform'
    New-Item -ItemType Directory -Path $terraformDir -Force | Out-Null
    Expand-Archive -Path $zip -DestinationPath $terraformDir -Force
    $sig = Get-AuthenticodeSignature -FilePath $terraformExe
    Write-Host "  terraform.exe signature: $($sig.Status) $(if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject })"
    Add-MachinePath $terraformDir
}

function Set-SealedDefaults {
    Write-Phase "Defaults for a PAW without internet"
    # Terraform's version check (checkpoint-api.hashicorp.com) and npm's update,
    # audit and funding lookups cannot work on a locked PAW; they only add
    # delays and errors. Packages are audited before they are approved.
    Set-MachineVariable 'CHECKPOINT_DISABLE' '1'
    Set-MachineVariable 'npm_config_update_notifier' 'false'
    Set-MachineVariable 'npm_config_audit' 'false'
    Set-MachineVariable 'npm_config_fund' 'false'
    # Node.js and npm handle paths over 260 characters once Windows allows them.
    Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1 -Type DWord
    Write-Host "  LongPathsEnabled = 1"
    # npm and pnpm also ship PowerShell (.ps1) launchers. Windows' default
    # execution policy blocks those, which breaks "pnpm install" in a
    # PowerShell or VS Code terminal. Without them PowerShell uses the .cmd
    # launchers, which work under any execution policy - no policy is loosened.
    foreach ($name in 'npm', 'npx', 'pnpm', 'pnpx') {
        $ps1 = Join-Path $nodeDir "$name.ps1"
        if (Test-Path $ps1) { Remove-Item $ps1 -Force; Write-Host "  removed $name.ps1 (the $name.cmd launcher stays)" }
    }
    Write-Host "  execution policy here: $(Get-ExecutionPolicy -Scope LocalMachine) (unchanged)"
}

function Test-DevTools {
    Write-Phase "Smoke test: every tool runs from PATH and reports its pinned version"
    Update-SessionPath
    $results = [ordered]@{
        code      = @($DevTools.VSCode.Version, (Get-Item $codeExe).VersionInfo.ProductVersion)
        node      = @("v$($DevTools.Node.Version)", (Get-NativeOutput 'node' @('--version')))
        pnpm      = @($DevTools.Pnpm.Version, (Get-NativeOutput 'pnpm.cmd' @('--version')))
        git       = @("git version $($DevTools.Git.Version).windows.", (Get-NativeOutput 'git' @('--version')))
        terraform = @($DevTools.Terraform.Version, ((Get-NativeOutput 'terraform' @('version', '-json')) | ConvertFrom-Json).terraform_version)
    }
    $failed = @()
    foreach ($k in $results.Keys) {
        $want, $got = $results[$k]
        $ok = if ($k -eq 'git') { $got.StartsWith($want) } else { Test-SameVersion $got $want }
        Write-Host ("  {0,-10} {1,-32} {2}" -f $k, $got, $(if ($ok) { 'OK' } else { "EXPECTED $want" }))
        if (-not $ok) { $failed += $k }
    }
    Write-Host "  npm $(Get-NativeOutput 'npm.cmd' @('--version')) (bundled with Node.js)"
    foreach ($cmd in 'code', 'node', 'npm', 'pnpm', 'git', 'terraform') {
        $c = Get-Command $cmd -ErrorAction SilentlyContinue | Select-Object -First 1
        Write-Host ("  PATH {0,-10} -> {1}" -f $cmd, $(if ($c) { $c.Source } else { 'NOT FOUND' }))
        if (-not $c) { $failed += "PATH:$cmd" }
    }
    $editor = try { Get-NativeOutput $gitExe @('config', '--system', '--get', 'core.editor') } catch { '(not set - git falls back to vim)' }
    Write-Host "  git editor: $editor"
    if ($failed.Count) { throw "Developer tools smoke test failed: $($failed -join ', ')" }
}

function Write-Manifest {
    Write-Phase "Record what this image contains"
    $dir = Join-Path $env:ProgramData 'Zenblox'
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $manifest = [ordered]@{ installedUtc = (Get-Date).ToUniversalTime().ToString('s') + 'Z'; tools = [ordered]@{} }
    foreach ($k in $DevTools.Keys) {
        $t = $DevTools[$k]
        $manifest.tools[$k] = [ordered]@{ version = $t.Version; url = $t.Url; checksum = $(if ($t.Sha512) { "sha512:$($t.Sha512)" } else { "sha256:$($t.Sha256)" }) }
    }
    $path = Join-Path $dir 'paw-devtools.json'
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $path -Encoding UTF8
    Write-Host "  $path"
}

# --- main ------------------------------------------------------------------

Install-VSCode
Set-VSCodePolicy
Install-Node
Install-Pnpm
Install-Git
Install-Terraform
Set-SealedDefaults
Test-DevTools
Write-Manifest

Write-Phase "Clean up downloads"
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem $logDir -Filter 'paw-devtools-*.log' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Write-Host "  removed $work and the installer logs"

Write-Host "PAW DEV TOOLS COMPLETE" -ForegroundColor Green
