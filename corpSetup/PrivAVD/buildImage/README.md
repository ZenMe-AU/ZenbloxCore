# PAW image build

This folder builds and publishes the Windows golden image used by the PAW Azure
Virtual Desktop deployment. Run it through the parent wrapper:

```powershell
..\\build.ps1
```

Configuration is loaded from the shared parent `.env` file. The gallery and
image definition must already exist.

## TODO

- [ ] Add a controlled image patching process and validate rebuilt images before
  replacing the PAW session host.
- [ ] Seed the Winget-Repo with an approved package list at build time
  (currently the repo starts empty; the PAW admin manages packages via the
  dashboard after first boot).
- [ ] Test that the Task Scheduler service survives sysprep on the first
  deployed PAW (the AtStartup trigger should fire on boot).

## Design decisions

### Product decisions (Winget-Repo in the golden image)

- Every PAW deployed from this image includes a private Winget-Repo instance
  running on https://localhost:5000 — no network access needed, no external
  dependencies, works on a born-locked PAW.
- Winget-Repo is pinned to V2.9.2. Upgrades = new image build (monthly patch
  cycle).
- Python 3.12.10 is installed system-wide from the offline package set, with all
  19 Winget-Repo dependencies (Flask, FastAPI, cryptography, pymsix, etc.)
  baked at build time.
- A 10-year self-signed localhost TLS certificate is generated at build time
  and trusted in the machine Root store. Every PAW gets the same cert —
  acceptable because the service is localhost-only (no network exposure).
- The winget client is configured for EVERY user by a logon task
  ("WingetRepo-ClientConfig"): winget's execution alias and source settings
  are PER-USER and do not survive sysprep (the AVD image ships App Installer
  but the winget.exe alias is missing for new users - observed 2026-10-28),
  so the task runs at every logon as the logging-in user: materialize the
  execution alias, add the source "WingetRepo" -> https://localhost:5000/api/,
  and remove the default sources (community "winget" and "msstore").
  The client token is read from the repo database at runtime, so token
  rotations self-heal at the next logon.
  On a born-locked PAW they are unreachable anyway; removing them avoids
  confusing error messages and enforces the approved-software-only principle.
- The repo starts EMPTY. The PAW admin creates the first dashboard account on
  first visit (https://localhost:5000) and manages packages there. No admin
  credentials are baked into the image. Seeding the package list at build
  time is a TODO (requires the Package Store feature or direct SQLite
  writes at build time).
- A random client token is generated per build (fdde5fb) and baked into the
  database so winget can authenticate immediately on first boot - the value
  never exists in the repo. The token is only usable by processes already
  running on the PAW (localhost-only service), so sharing it across PAWs is
  acceptable — an attacker on the PAW can already do anything.

### SDLC / delivery process decisions

- The provisioner script (img-install-wingetrepo.ps1) runs AFTER the Windows
  restart and BEFORE sysprep. This ensures:
  1. The build VM is stable (post-restart)
  2. The service is stopped before sysprep (running services break generalization)
  3. The Task Scheduler task is registered but not running in the sealed image
- The service uses Task Scheduler (NOT NSSM) — nssm.cc returns HTTP 503 from
  Azure IP ranges (proven 2026-10-20). Task Scheduler is built into Windows,
  zero third-party downloads, and the AtStartup trigger fires reliably on
  every boot.
- The service runs as SYSTEM with `/ssl=true` flag (binds 127.0.0.1:5000
  HTTPS only — never 0.0.0.0). External access is impossible because the
  service does not listen on external interfaces.
- No Windows Firewall rule is needed for port 5000: the service binds to
  127.0.0.1 only, so the default deny-all inbound is sufficient.
- The provisioner is idempotent (safe to re-run on a test VM to validate
  before a Packer build).

### Offline package set (2026-10-22)

- The Winget-Repo provisioner installs from a local package archive - the
  build never touches PyPI or GitHub for Winget-Repo software:
  - Source folder on the build host: `C:\zenme\dependencies\packages`
    (absolute path for now; the permanent home should be the repo or a
    share).
  - `make-packages-zip.ps1` packs that folder into
    `C:\zenme\dependencies\wingetrepo-packages.zip` (excludes cp313/cp314
    wheels - dead weight for a CPython 3.12 image). Rerun it whenever the
    package folder changes.
  - `upload-packages.ps1` uploads the zip to Azure Blob Storage (storage
    account `pawpkg<hash>` derived from the subscription + gallery RG,
    container `wingetrepo`), mints a
    read-only 1-year SAS URL and writes it into the shared `.env` as
    `TF_VAR_PACKAGE_URL`. Run once after make-packages-zip.ps1; the blob
    only needs re-uploading when the zip changes.
  - The build VM downloads the archive from that URL (PACKAGE_URL variable
    -> provisioner environment var) over Azure's intra-Azure path -
    seconds, with progress output - and extracts it to `C:\packages`.
    Bulk WinRM transfer was abandoned after two hangs: a 68-file directory
    walk AND a single 53 MB zip both stalled silently (WinRM chunks every
    upload into hundreds of tiny PowerShell commands with no progress
    output).
  - Archive contents: `python-3.12.10-amd64.exe`, `V2.9.2.zip`,
    `requirements.txt` and the CPython 3.12 / win_amd64 wheelhouse
    (`*.whl`, 55 packages).
- pip runs with `--no-index --find-links C:\packages`: a missing or
  wrong-version wheel fails the build loudly instead of silently reaching
  the internet.
- The wheelhouse must match the Python version installed in the image
  (CPython 3.12). Wheels tagged cp313/cp314 will NOT install on 3.12.
  Regenerate the wheelhouse from any machine (any Python version):

  ```bash
  uv pip compile requirements.txt --python-platform x86_64-pc-windows-msvc \
      --python-version 3.12 --no-header -o locked.txt
  python3 -m pip download --no-deps --only-binary=:all: --platform win_amd64 \
      --python-version 3.12 --implementation cp --abi cp312 --abi abi3 --abi none \
      -d . -r locked.txt
  ```

  (pip's resolver backtracks badly when cross-downloading for another
  Python/platform — resolve with uv first, then fetch exact pins with
  `--no-deps`.)
- The build host needs NO Python for the build itself: only Packer + the az
  CLI. The wheelhouse is frozen in the package archive.
- Still requires network during the build: the `windows-update` provisioner,
  the Microsoft-hosted AVD agent downloads, and the package-archive blob
  download. The Winget-Repo SOFTWARE install itself is offline (pip
  --no-index against the local wheelhouse).

### Existing decisions (pre-Winget-Repo)

- The source is the latest Windows 11 multi-session AVD image.
- Current Microsoft-signed AVD Agent and Boot Loader installers are staged in
  the image but installed only after deployment with a host-pool registration token.
- Hardening runs before the VM is restarted and generalized.
- Each build publishes a new immutable timestamped image version.
- The image is replicated to the configured PAW region.
- Windows Update is not run unless its Packer provisioner is explicitly enabled.

- Packer builds the image; Terraform only creates the gallery prerequisites.
- Azure CLI authentication is reused instead of storing build credentials.
- Relative build scripts are resolved by running Packer from this folder.