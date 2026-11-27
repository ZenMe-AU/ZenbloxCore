# Installs the PAW developer tools for the signed-in user, without admin rights.
#
# Reads <ShareRoot>\Installers\paw-user-tools.json (the tool list) from the
# Artifact Keeper read-only file share, and for each tool, in list order:
#   1. skips it when this user already has that exact file installed;
#   2. copies the file from the share to a local folder and checks its SHA-256
#      against the list (a mismatch is refused, nothing runs);
#   3. installs it for this user only:
#        exe = run the vendor installer silently (it installs per user),
#        zip = unpack into %LOCALAPPDATA%\Programs\Zenblox\<folder> and add it
#              to the user's PATH,
#        npm = npm install -g into that tool folder (pnpm into Node.js);
#   4. runs the tool once with --version as a smoke test.
# It also sets the user environment variables in the list (offline defaults).
#
# Started hidden at every sign-in by Invoke-PawSignIn.ps1 (deployPaw). Fast
# when nothing changed. Log: %LOCALAPPDATA%\Zenblox\logs\paw-user-tools.log.
# Windows PowerShell 5.1. Exit 0 = all tools current, 1 = at least one failed
# (the others are still installed; the next sign-in retries).
param(
    [Parameter(Mandatory)] [string] $ShareRoot,
    [string] $ListPath = 'Installers\paw-user-tools.json',
    [string] $InstallRoot = (Join-Path $env:LOCALAPPDATA 'Programs\Zenblox'),
    [string] $StateDir = (Join-Path $env:LOCALAPPDATA 'Zenblox'),
    [int] $WaitForShareSeconds = 300
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Expand-Archive is very slow with the progress bar

$logDir = Join-Path $StateDir 'logs'
$logFile = Join-Path $logDir 'paw-user-tools.log'
$stateFile = Join-Path $StateDir 'paw-user-tools-state.json'
$downloadDir = Join-Path $StateDir 'download'
New-Item -ItemType Directory -Force -Path $logDir, $downloadDir, $InstallRoot | Out-Null
if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 1MB) {
    Move-Item $logFile "$logFile.old" -Force
}

function Write-Log([string] $Message) {
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $logFile -Value $line -Encoding UTF8
    Write-Output $line
}

# One run at a time per user session (sign-in can fire twice on reconnects).
$mutex = New-Object System.Threading.Mutex($false, 'Local\ZenbloxPawUserTools')
if (-not $mutex.WaitOne(0)) { Write-Log 'Another run is active in this session; exiting.'; exit 0 }

function Get-ExpandedPath([string] $Path, [string] $ToolDir) {
    $p = [Environment]::ExpandEnvironmentVariables($Path)
    if (-not [IO.Path]::IsPathRooted($p)) { $p = Join-Path $ToolDir $p }
    return [IO.Path]::GetFullPath($p).TrimEnd('\')   # 'nodejs\.' -> 'nodejs'
}

function Read-State {
    if (Test-Path $stateFile) {
        try {
            $h = @{}
            (Get-Content $stateFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $h[$_.Name] = $_.Value }
            return $h
        }
        catch { Write-Log "State file unreadable, starting fresh: $($_.Exception.Message)" }
    }
    return @{}
}

function Save-State([hashtable] $State) {
    $tmp = "$stateFile.tmp"
    ($State | ConvertTo-Json -Depth 4) | Set-Content -Path $tmp -Encoding UTF8
    Move-Item -Path $tmp -Destination $stateFile -Force
}

# User PATH lives in HKCU\Environment as REG_EXPAND_SZ; read it unexpanded so
# entries like %USERPROFILE%\... that installers wrote stay intact.
function Add-UserPath([string] $Dir) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
    try {
        $current = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        $parts = @($current -split ';' | Where-Object { $_ -ne '' })
        $already = $parts | Where-Object {
            try { [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($_)).TrimEnd('\') -ieq $Dir.TrimEnd('\') } catch { $false }
        }
        if (-not $already) {
            $key.SetValue('Path', (($parts + $Dir) -join ';'), [Microsoft.Win32.RegistryValueKind]::ExpandString)
            Write-Log "  added to user PATH: $Dir"
            $script:envChanged = $true
        }
    }
    finally { $key.Close() }
    # Make the tool usable by the steps that follow in this same run.
    if (-not (($env:Path -split ';') -contains $Dir)) { $env:Path = "$env:Path;$Dir" }
}

function Set-UserVariable([string] $Name, [string] $Value) {
    if ([Environment]::GetEnvironmentVariable($Name, 'User') -ne $Value) {
        [Environment]::SetEnvironmentVariable($Name, $Value, 'User')
        Write-Log "  user variable $Name=$Value"
        $script:envChanged = $true
    }
    Set-Item -Path "Env:$Name" -Value $Value
}

# Tell Explorer the environment changed, so programs started afterwards see
# the new PATH without signing out.
function Send-EnvironmentChange {
    if (-not ('Zenblox.EnvNotify' -as [type])) {
        Add-Type -Namespace Zenblox -Name EnvNotify -MemberDefinition @'
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
'@
    }
    $result = [UIntPtr]::Zero
    [void][Zenblox.EnvNotify]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)
}

function Invoke-Checked([string] $FilePath, [string[]] $Arguments, [int] $TimeoutMinutes = 20) {
    $p = Start-Process -FilePath $FilePath -ArgumentList $Arguments -PassThru -WindowStyle Hidden
    if (-not $p.WaitForExit($TimeoutMinutes * 60 * 1000)) {
        try { $p.Kill() } catch { }
        throw "$([IO.Path]::GetFileName($FilePath)) did not finish within $TimeoutMinutes minutes"
    }
    if ($p.ExitCode -notin 0, 3010) { throw "$([IO.Path]::GetFileName($FilePath)) exited with code $($p.ExitCode)" }
}

function Install-Tool($Tool, [string] $LocalFile, [string] $ToolDir) {
    switch ($Tool.type) {
        'exe' {
            Invoke-Checked -FilePath $LocalFile -Arguments @($Tool.args)
        }
        'zip' {
            $staging = "$ToolDir.new"
            if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
            Expand-Archive -LiteralPath $LocalFile -DestinationPath $staging -Force
            $source = $staging
            if ($Tool.zipSubfolder) { $source = Join-Path $staging $Tool.zipSubfolder }
            if (-not (Test-Path $source)) { throw "zip has no folder '$($Tool.zipSubfolder)'" }
            if (Test-Path $ToolDir) { Remove-Item $ToolDir -Recurse -Force }
            Move-Item -Path $source -Destination $ToolDir
            if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
            foreach ($rel in @($Tool.path)) { Add-UserPath (Get-ExpandedPath $rel $ToolDir) }
        }
        'npm' {
            $npm = Join-Path $ToolDir 'npm.cmd'
            if (-not (Test-Path $npm)) { throw "npm not found at $npm (install Node.js first, above this tool in the list)" }
            $out = & $npm install --global --prefix $ToolDir $LocalFile --no-audit --no-fund 2>&1
            if ($LASTEXITCODE -ne 0) { throw "npm install exited with code ${LASTEXITCODE}: $(($out | Select-Object -Last 3) -join ' ')" }
        }
        default { throw "unknown type '$($Tool.type)'" }
    }
    # PowerShell would prefer the .ps1 launchers of npm/npx/pnpm, which an
    # execution policy can block; without them it uses the .cmd launchers.
    if (Test-Path $ToolDir) {
        Get-ChildItem -Path $ToolDir -Filter '*.ps1' -File |
            Where-Object { $_.BaseName -in 'npm', 'npx', 'pnpm', 'pnpx', 'corepack' } |
            Remove-Item -Force
    }
}

$exitCode = 0
$script:envChanged = $false
try {
    Write-Log "=== PAW user tools: $env:USERNAME on $env:COMPUTERNAME, share $ShareRoot"

    # The share needs the user's cloud Kerberos ticket, which can take a moment
    # after sign-in: retry until the list is readable.
    $listFile = Join-Path $ShareRoot $ListPath
    $deadline = (Get-Date).AddSeconds($WaitForShareSeconds)
    while (-not (Test-Path -LiteralPath $listFile)) {
        if ((Get-Date) -gt $deadline) { throw "tool list not reachable after $WaitForShareSeconds s: $listFile" }
        Start-Sleep -Seconds 10
    }
    $list = Get-Content -LiteralPath $listFile -Raw | ConvertFrom-Json
    if ($list.schema -ne 1) { throw "unsupported tool list schema '$($list.schema)'" }

    if ($list.environment) {
        foreach ($p in $list.environment.PSObject.Properties) { Set-UserVariable $p.Name ([string]$p.Value) }
    }

    $state = Read-State
    foreach ($tool in @($list.tools)) {
        $name = $tool.name
        try {
            $sha = ([string]$tool.sha256).ToLowerInvariant()
            if ($sha -notmatch '^[0-9a-f]{64}$') { throw 'sha256 missing or malformed in the tool list' }
            $toolDir = Join-Path $InstallRoot $(if ($tool.folder) { $tool.folder } else { $name })
            $check = Get-ExpandedPath $tool.check $toolDir
            $prev = $state[$name]
            if ($prev -and $prev.sha256 -eq $sha -and (Test-Path -LiteralPath $check)) {
                # Re-add PATH entries in case the user removed them.
                if ($tool.type -eq 'zip') { foreach ($rel in @($tool.path)) { Add-UserPath (Get-ExpandedPath $rel $toolDir) } }
                Write-Log "$name $($tool.version): current"
                continue
            }

            Write-Log "$name $($tool.version): installing"
            $source = Join-Path $ShareRoot ($tool.file -replace '/', '\')
            $local = Join-Path $downloadDir ([IO.Path]::GetFileName($source))
            Copy-Item -LiteralPath $source -Destination $local -Force
            $actual = (Get-FileHash -LiteralPath $local -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actual -ne $sha) {
                Remove-Item -LiteralPath $local -Force
                throw "SHA-256 mismatch (list $sha, file $actual) - refused, nothing installed"
            }

            Install-Tool -Tool $tool -LocalFile $local -ToolDir $toolDir
            if (-not (Test-Path -LiteralPath $check)) { throw "installed, but $check is missing" }

            $version = (& $check --version 2>&1 | Select-Object -First 1)
            foreach ($a in @($tool.after)) { if ($a) { & $check @a 2>&1 | Out-Null } }
            Remove-Item -LiteralPath $local -Force -ErrorAction SilentlyContinue

            $state[$name] = [pscustomobject]@{ version = $tool.version; sha256 = $sha; installed = (Get-Date -Format s) }
            Save-State $state
            Write-Log "$name $($tool.version): OK ($version)"
        }
        catch {
            $exitCode = 1
            Write-Log "$name $($tool.version): FAILED - $($_.Exception.Message)"
        }
    }
}
catch {
    $exitCode = 1
    Write-Log "FAILED - $($_.Exception.Message)"
}
finally {
    if ($script:envChanged) { Send-EnvironmentChange }
    Write-Log "=== done (exit $exitCode)"
    $mutex.ReleaseMutex()
}
exit $exitCode
