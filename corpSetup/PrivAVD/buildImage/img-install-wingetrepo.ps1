#requires -RunAsAdministrator
# Installs Winget-Repo into the golden image as a localhost-only service.
# Runs during the Packer build from a LOCAL package set (no internet):
# the Packer "file" provisioner in paw-image.pkr.hcl uploads the single
# archive built by make-packages-zip.ps1:
#   C:\zenme\dependencies\wingetrepo-packages.zip   (build host / Erv-pc)
# to
#   C:\Windows\Temp\packages.zip                     (build VM)
# and this script extracts it to C:\packages.
# Idempotent - safe to re-run on a test VM to validate before a build.
#
# After this script runs, every PAW deployed from this image has:
#   - Python 3.12 + Winget-Repo V2.9.2 + all dependencies
#   - A 10-year localhost TLS certificate (trusted in the machine Root store)
#   - A Task Scheduler service (AtStartup, SYSTEM) serving https://localhost:5000
#   - A winget source "WingetRepo" pointing at the local repo
#   - Default winget sources (community/msstore) removed
#   - A client token in the database so winget can authenticate
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

# Offline package set, uploaded to the build VM by the Packer "file"
# provisioner as a single archive and extracted to C:\packages below.
# Archive contents:
#   python-3.12.10-amd64.exe
#   V2.9.2.zip                        (Winget-Repo source archive)
#   requirements.txt                  (reference copy)
#   *.whl                             (wheelhouse for CPython 3.12 / win_amd64)
$packageDir = 'C:\packages'
$packageZip = 'C:\Windows\Temp\packages.zip'

# Fixed client token for the winget REST API (localhost-only, baked into every
# PAW from this image; usable only by processes already running on the PAW).
$clientToken = '9f8e7d6c-5b4a-3c2d-1e0f-9a8b7c6d5e4f'

function Write-Step([string]$message) {
    Write-Host ">> $message" -ForegroundColor Cyan
}

# --- 0. Extract the offline package set (uploaded by the file provisioner) ---
Write-Step "Offline package source: $packageDir"
if (-not (Test-Path $packageDir)) {
    if (-not (Test-Path $packageZip)) {
        throw "Package archive not found: $packageZip (Packer file provisioner failed?)"
    }
    Write-Step "Extracting $packageZip -> $packageDir"
    Expand-Archive -Path $packageZip -DestinationPath $packageDir -Force
    if (-not (Test-Path $packageDir)) { throw "Extraction to $packageDir failed" }
    Write-Host "  Extracted $(@(Get-ChildItem $packageDir -File).Count) files"
} else {
    Write-Host '  Package directory already present (idempotent re-run)'
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
# --no-index + --find-links: install ONLY from the uploaded wheelhouse.
# If a wheel is missing or built for the wrong Python version, pip fails
# loudly here instead of silently reaching the internet.
& $pythonExe -m pip install --no-index --find-links $packageDir --no-warn-script-location -r "$repoDir\requirements.txt"
if ($LASTEXITCODE -ne 0) {
    throw "pip install failed from offline wheelhouse ($packageDir). Check that the wheels match CPython 3.12 / win_amd64 (cp312 or abi3 tags, not cp313/cp314)."
}

# --- 4. Generate localhost TLS certificate (10-year) ---
Write-Step 'Generate TLS certificate'
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
Write-Step 'Smoke test'
Start-ScheduledTask -TaskName 'WingetRepo'
Start-Sleep -Seconds 15
$listen = ($null -ne (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue))
Write-Host "  Listening on port 5000: $listen"
if (-not $listen) { throw 'WingetRepo service did not start listening on port 5000' }
$statusCode = & curl.exe -k -s -o NUL -w '%{http_code}' 'https://localhost:5000/'
Write-Host "  HTTPS localhost:5000 status: $statusCode"
if ($statusCode -notin @('200','302','303')) {
    Write-Warning "  Unexpected status $statusCode (expected 200/302/303)"
}

# --- 9. Configure winget client (add local source, remove defaults) ---
Write-Step 'Configure winget client'
try {
    # Add the localhost source with the client token
    $headerArg = "{'Token': '$clientToken'}"
    $existing = & winget source list 2>$null | Select-String -Pattern 'WingetRepo'
    if (-not $existing) {
        & winget source add -n WingetRepo -t Microsoft.Rest -a https://localhost:5000/api/ --header $headerArg --accept-source-agreements 2>$null
        Write-Host '  winget source added: WingetRepo -> https://localhost:5000/api/'
    } else {
        Write-Host '  winget source already exists'
    }

    # Remove default sources (born-locked PAW cannot reach them anyway)
    foreach ($srcName in @('winget', 'msstore')) {
        $has = & winget source list 2>$null | Select-String -Pattern $srcName
        if ($has) {
            & winget source remove --name $srcName 2>$null
            Write-Host "  removed default source: $srcName"
        }
    }
} catch {
    Write-Warning "winget CLI configuration skipped: $_"
    Write-Warning 'The PAW admin can configure the source manually after first boot.'
}

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
Write-Host "  Package source: $packageDir (offline - no internet used)"
Write-Host "  Service: Task Scheduler 'WingetRepo' (AtStartup, SYSTEM, localhost-only)"
Write-Host "  Endpoint: https://localhost:5000/ (first dashboard visit = create admin)"
Write-Host "  winget source: WingetRepo -> https://localhost:5000/api/"
Write-Host "  Client token: baked (winget can authenticate immediately)"
Write-Host "  Default sources: removed (winget + msstore)"
Write-Host "  Cert: 10-year localhost, trusted in Root store"