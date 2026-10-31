#requires -RunAsAdministrator
# Installs Winget-Repo into the golden image as a localhost-only service.
# Runs during the Packer build from a LOCAL package set (no PyPI/GitHub):
# the PACKAGE_URL environment variable (set in paw-image.pkr.hcl from
# TF_VAR_PACKAGE_URL in .env, maintained by upload-packages.ps1) points at
# the package archive in Azure Blob Storage. This script downloads it to
#   C:\Windows\Temp\packages.zip
# and extracts it to C:\packages before installing from it.
# Idempotent - safe to re-run on a test VM to validate before a build.
#
# After this script runs, every PAW deployed from this image has:
#   - Python 3.12 + Winget-Repo V2.9.2 + all dependencies
#   - A 10-year localhost TLS certificate (trusted in the machine Root store)
#   - A Task Scheduler service (AtStartup, SYSTEM) serving https://localhost:5000
#   - A random client token in the database (per build, never in the repo)
#   - A per-user logon task that configures winget for EVERY user at logon:
#     execution alias, WingetRepo source (token read from the DB), default
#     sources removed. winget's config is PER-USER and does not survive
#     sysprep, so it cannot be done once at build time for future users.
#
# The repo starts EMPTY - the PAW admin creates their account on first
# dashboard visit (https://localhost:5000) and manages packages there.
#
# IMPORTANT: the service is stopped at the end of this script (before sysprep).
# The Task Scheduler task re-starts it on every boot of every deployed PAW.

$ErrorActionPreference = 'Stop'

$repoDir = 'C:\Winget-Repo'
$toolsDir = 'C:\Tools'
$pythonExe = 'C:\Program Files\Python312\python.exe'
$wingetRepoTag = 'V2.9.2'

# Offline package set, downloaded from Azure Blob Storage (PACKAGE_URL)
# and extracted to C:\packages below. Archive contents:
#   python-3.12.10-amd64.exe
#   V2.9.2.zip                        (Winget-Repo source archive)
#   requirements.txt                  (reference copy)
#   *.whl                             (wheelhouse for CPython 3.12 / win_amd64)
$packageDir = 'C:\packages'
$packageZip = 'C:\Windows\Temp\packages.zip'

# Random client token for the winget REST API, generated per build (localhost-
# only; usable only by processes already running on the PAW). The value exists
# only in the image's Database.db - never in the repo. Client configuration
# (configure-client.ps1, logon task) reads it from the DB at runtime, so token
# rotations self-heal at the next logon.
$clientToken = [guid]::NewGuid().ToString()

function Write-Step([string]$message) {
    Write-Host ">> $message" -ForegroundColor Cyan
}

# --- 0. Fetch and extract the offline package set (Azure blob download) ---
# Content-validated idempotency: the KEY FILE (python installer) must be
# present, not just the directory. An empty or partial C:\packages - however
# it appeared - triggers a fresh download+extract instead of skipping
# provisioning and failing later with a confusing error (observed
# 2026-10-27: directory existed on a fresh build VM with no installer in it).
Write-Step "Offline package source: $packageDir"
$packageSetMarker = Join-Path $packageDir 'python-3.12.10-amd64.exe'
if (-not (Test-Path $packageSetMarker)) {
    if (Test-Path $packageDir) {
        $existing = @(Get-ChildItem $packageDir -File -ErrorAction SilentlyContinue)
        $existingNames = ($existing | Select-Object -First 5 -ExpandProperty Name) -join ', '
        Write-Host "  Package directory exists but is INCOMPLETE ($($existing.Count) files: $existingNames) - re-provisioning"
    }
    if (-not (Test-Path $packageZip)) {
        Write-Step 'Downloading package archive (Azure blob, intra-Azure path)'
        if (-not $env:PACKAGE_URL) {
            throw 'PACKAGE_URL environment variable not set. Check TF_VAR_PACKAGE_URL in .env and environment_vars in paw-image.pkr.hcl.'
        }
        $downloadStart = Get-Date
        Invoke-WebRequest -Uri $env:PACKAGE_URL -UseBasicParsing -OutFile $packageZip -TimeoutSec 600
        $archiveMb = [math]::Round((Get-Item $packageZip).Length / 1MB, 1)
        Write-Host ("  Downloaded {0} MB in {1}s" -f $archiveMb, [int]((Get-Date) - $downloadStart).TotalSeconds)
    }
    Write-Step "Extracting $packageZip -> $packageDir"
    Expand-Archive -Path $packageZip -DestinationPath $packageDir -Force
    if (-not (Test-Path $packageSetMarker)) { throw "Extraction to $packageDir failed (installer still missing after extract)" }
    Write-Host "  Extracted $(@(Get-ChildItem $packageDir -File).Count) files"
} else {
    Write-Host '  Package set verified (python installer present - idempotent re-run)'
}

# --- 1. Install Python 3.12 (all users, on PATH) ---
Write-Step 'Install Python 3.12'
if (-not (Test-Path $pythonExe)) {
    $installer = Join-Path $packageDir 'python-3.12.10-amd64.exe'
    if (-not (Test-Path $installer)) { throw "Python installer not found: $installer" }
    $p = Start-Process -FilePath $installer -ArgumentList '/quiet','InstallAllUsers=1','PrependPath=1','Include_test=0' -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "Python installer exited $($p.ExitCode)" }
}

# --- 2. Install Winget-Repo from the local archive (pinned version) ---
Write-Step "Install Winget-Repo $wingetRepoTag (local archive)"
if (-not (Test-Path "$repoDir\main.py")) {
    $zip = Join-Path $packageDir "$wingetRepoTag.zip"
    if (-not (Test-Path $zip)) { throw "Winget-Repo archive not found: $zip" }
    Expand-Archive -Path $zip -DestinationPath "$env:TEMP\wr-extract" -Force
    $inner = Get-ChildItem "$env:TEMP\wr-extract" -Directory | Select-Object -First 1
    New-Item -ItemType Directory -Force -Path $repoDir | Out-Null
    Get-ChildItem $inner.FullName | Move-Item -Destination $repoDir
}
if (-not (Test-Path "$repoDir\main.py")) { throw 'main.py missing after extraction' }

# --- 3. Python dependencies (offline wheelhouse only) ---
Write-Step 'pip install requirements (offline wheelhouse)'
# --no-index + --find-links: install ONLY from the local wheelhouse.
# If a wheel is missing or built for the wrong Python version, pip fails
# loudly here instead of silently reaching the internet.
& $pythonExe -m pip install --no-index --find-links $packageDir --no-warn-script-location -r "$repoDir\requirements.txt"
if ($LASTEXITCODE -ne 0) {
    throw "pip install failed from offline wheelhouse ($packageDir). Check that the wheels match CPython 3.12 / win_amd64 (cp312 or abi3 tags, not cp313/cp314)."
}

# --- 4. Generate self-signed localhost TLS certificate (10-year) ---
Write-Step 'Generate self-signed TLS certificate'
$sslDir = "$repoDir\Config\SSL"
if (-not (Test-Path "$sslDir\cert.pem")) {
    New-Item -ItemType Directory -Force -Path $sslDir | Out-Null
    $genCert = @'
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import datetime, ipaddress, os

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, u"localhost")])
cert = (
    x509.CertificateBuilder()
    .subject_name(subject)
    .issuer_name(issuer)
    .public_key(key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(datetime.datetime.utcnow() - datetime.timedelta(days=1))
    .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=3650))
    .add_extension(x509.SubjectAlternativeName([
        x509.DNSName(u"localhost"),
        x509.IPAddress(ipaddress.IPv4Address(u"127.0.0.1")),
    ]), critical=False)
    .sign(key, hashes.SHA256())
)
cert_path = os.path.join(os.environ["SSL_DIR"], "cert.pem")
key_path = os.path.join(os.environ["SSL_DIR"], "key.pem")
with open(cert_path, "wb") as f:
    f.write(cert.public_bytes(serialization.Encoding.PEM))
with open(key_path, "wb") as f:
    f.write(key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ))
print("Certificate generated:", cert_path)
'@
    $genCert | Set-Content -Path "$env:TEMP\gen-cert.py" -Encoding ASCII
    $env:SSL_DIR = $sslDir
    & $pythonExe "$env:TEMP\gen-cert.py"
    if ($LASTEXITCODE -ne 0) { throw 'Certificate generation failed' }
}

# --- 5. Trust the certificate in the machine Root store ---
Write-Step 'Trust certificate in Root store'
$existingCert = Get-ChildItem Cert:\LocalMachine\Root -ErrorAction SilentlyContinue |
    Where-Object { $_.Subject -eq 'CN=localhost' }
if (-not $existingCert) {
    certutil -addstore Root "$sslDir\cert.pem"
}

# --- 6. Create Task Scheduler service (AtStartup, SYSTEM, localhost-only) ---
Write-Step 'Configure Task Scheduler service'
$action = New-ScheduledTaskAction -Execute $pythonExe `
    -Argument "$repoDir\main.py /ssl=true" `
    -WorkingDirectory $repoDir
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName 'WingetRepo' `
    -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null

# --- 7. Inject the winget client token into the database ---
Write-Step 'Inject winget client token'
$dbPath = "$repoDir\Modules\Database\Database.db"
if (Test-Path $dbPath) {
    $injectToken = @'
import sqlite3, os, uuid

db_path = os.path.join(os.environ["REPO_DIR"], "Modules", "Database", "Database.db")
conn = sqlite3.connect(db_path)
conn.execute(
    "INSERT OR REPLACE INTO tbl_CLIENTS (UID, NAME, IP, LASTSEEN, CLIENT, TOKEN, ENABLED) "
    "VALUES (?, ?, '', '', 1, ?, 1)",
    (str(uuid.uuid4()), "WingetClient", os.environ["CLIENT_TOKEN"])
)
conn.commit()
row = conn.execute("SELECT NAME, TOKEN, ENABLED FROM tbl_CLIENTS").fetchone()
print("Client token registered:", row[0], "enabled:", row[2])
conn.close()
'@
    $injectToken | Set-Content -Path "$env:TEMP\inject-token.py" -Encoding ASCII
    $env:REPO_DIR = $repoDir
    $env:CLIENT_TOKEN = $clientToken
    & $pythonExe "$env:TEMP\inject-token.py"
    if ($LASTEXITCODE -ne 0) { throw 'Client token injection failed' }
} else {
    Write-Warning 'Database not found - client token not injected'
}

# --- 8. Start service for smoke test ---
# The AtStartup task is for production (every boot of every deployed PAW).
# For the smoke test we launch main.py DIRECTLY with stdout/stderr redirected
# so a startup crash leaves a traceback in the build log instead of failing
# silently. Cold start can take 20-60s+ on a throttled B4ms (heavy imports:
# flask, fastapi, pydantic, cryptography) - poll instead of a fixed sleep.
Write-Step 'Smoke test'
$smokeErr = "$env:TEMP\wingetrepo-smoke.err.log"
$smokeOut = "$env:TEMP\wingetrepo-smoke.out.log"
Start-Process -FilePath $pythonExe -ArgumentList "$repoDir\main.py", '/ssl=true' `
    -WorkingDirectory $repoDir -WindowStyle Hidden `
    -RedirectStandardError $smokeErr -RedirectStandardOutput $smokeOut
$listen = $false
foreach ($i in 1..24) {                # poll up to 120 seconds
    Start-Sleep -Seconds 5
    if ($null -ne (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue)) {
        $listen = $true
        Write-Host ("  Listening on port 5000 (after {0}s)" -f ($i * 5))
        break
    }
}
if (-not $listen) {
    Write-Host '  --- smoke test diagnostics ---'
    Write-Host ("  python processes running: {0}" -f @(Get-Process python* -ErrorAction SilentlyContinue).Count)
    Write-Host ("  Task Scheduler task state: {0}" -f (Get-ScheduledTask -TaskName 'WingetRepo' -ErrorAction SilentlyContinue).State)
    if (Test-Path $smokeErr) {
        Write-Host '  --- main.py stderr (tail) ---'
        Get-Content $smokeErr -Tail 30 | ForEach-Object { Write-Host "    $_" }
    }
    throw 'WingetRepo did not start listening on port 5000 within 120s - see diagnostics above.'
}
$statusCode = & curl.exe -k -s -o NUL -w '%{http_code}' 'https://localhost:5000/'
Write-Host "  HTTPS localhost:5000 status: $statusCode"
if ($statusCode -notin @('200','302','303')) {
    Write-Warning "  Unexpected status $statusCode (expected 200/302/303)"
}

# --- 9. Per-user winget client configuration (logon task) ---
# winget's execution alias AND source configuration are PER-USER and do not
# survive sysprep: the AVD marketplace image ships App Installer but the
# winget.exe execution alias is missing for new users (observed 2026-10-28),
# and per-user source settings made at build time are wiped by generalize.
# So instead of configuring here (as the build user), stage a script and
# register a task that runs it at EVERY user logon AS THAT USER.
Write-Step 'Configure per-user winget client (logon task)'
New-Item -ItemType Directory -Force -Path 'C:\ProgramData\PAW\WingetRepo' | Out-Null
$clientConfig = @'
# Runs at every user logon as that user (Task: WingetRepo-ClientConfig,
# staged by img-install-wingetrepo.ps1). Idempotent - safe on every logon:
#   1. materialize the winget.exe execution alias (missing on sysprepped
#      AVD images for new users - re-register App Installer for this user)
#   2. read the client token from the repo database (baked at image build)
#   3. point winget at the localhost repo with that token and remove the
#      unreachable default sources
$ErrorActionPreference = 'Continue'
$repoDir = 'C:\Winget-Repo'
$pythonExe = 'C:\Program Files\Python312\python.exe'
$dbPath = Join-Path $repoDir 'Modules\Database\Database.db'

# 1. execution alias
if (-not (Test-Path "$env:LOCALAPPDATA\Microsoft\WindowsApps\winget.exe")) {
    $pkg = Get-AppxPackage -Name Microsoft.DesktopAppInstaller -ErrorAction SilentlyContinue
    if ($pkg) {
        try { Add-AppxPackage -DisableDevelopmentMode -Register "$($pkg.InstallLocation)\AppxManifest.xml" -ErrorAction Stop } catch { }
    }
}

# 2. token from the database (python is baked into the image)
# SQL is deliberately quote-free (numeric WHERE + rowid ordering) so no
# nested-quote escaping is needed across python/PowerShell layers. rowid
# ordering makes the build-baked WingetClient row win even if the admin
# adds more client rows via the dashboard later.
$token = ''
if ((Test-Path $pythonExe) -and (Test-Path $dbPath)) {
    $token = & $pythonExe -c "import sqlite3; print(sqlite3.connect(r'$dbPath').execute('SELECT TOKEN FROM tbl_CLIENTS WHERE ENABLED=1 ORDER BY rowid LIMIT 1').fetchone()[0])"
}

# 3. sources: remove + re-add (idempotent AND always carries the current token)
foreach ($srcName in @('WingetRepo', 'winget', 'msstore')) {
    $has = & winget source list 2>$null | Select-String -SimpleMatch $srcName
    if ($has) { & winget source remove --name $srcName 2>$null }
}
if ($token) {
    & winget source add -n WingetRepo -t Microsoft.Rest -a https://localhost:5000/api/ --header "{'Token': '$token'}" --accept-source-agreements 2>$null
}
'@
$clientConfig | Set-Content -Path 'C:\ProgramData\PAW\WingetRepo\configure-client.ps1' -Encoding ASCII
$ccAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\ProgramData\PAW\WingetRepo\configure-client.ps1'
$ccTrigger = New-ScheduledTaskTrigger -AtLogOn
$ccPrincipal = New-ScheduledTaskPrincipal -GroupId 'BUILTIN\Users' -RunLevel Limited
Register-ScheduledTask -TaskName 'WingetRepo-ClientConfig' `
    -Action $ccAction -Trigger $ccTrigger -Principal $ccPrincipal -Force | Out-Null
Write-Host '  task registered: WingetRepo-ClientConfig (runs at every user logon)'

# --- 10. Stop service (before sysprep) ---
Write-Step 'Stop service for sysprep'
Stop-ScheduledTask -TaskName 'WingetRepo' -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5
$stillListening = ($null -ne (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue))
if ($stillListening) {
    Write-Warning 'Service still listening - force-stopping python'
    Stop-Process -Name python -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
}

Write-Host ''
Write-Host 'WINGET-REPO GOLDEN IMAGE INSTALLATION COMPLETE' -ForegroundColor Green
Write-Host "  Package source: $packageDir (offline wheelhouse - no PyPI used)"
Write-Host "  Service: Task Scheduler 'WingetRepo' (AtStartup, SYSTEM, localhost-only)"
Write-Host "  Endpoint: https://localhost:5000/ (first dashboard visit = create admin)"
Write-Host "  winget client: per-user task 'WingetRepo-ClientConfig' (alias + source at every logon)"
Write-Host "  Client token: random per build, in DB only (clients read it at runtime)"
Write-Host "  Cert: 10-year localhost, trusted in Root store"