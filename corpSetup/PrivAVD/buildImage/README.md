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

### Product decisions (developer tools in the golden image)

- **Five tools for all users, baked at build time** (`img-install-devtools.ps1`,
  runs right after hardening): Visual Studio Code, Git for Windows, Node.js LTS
  with npm, pnpm and Terraform. A deployed PAW is born locked and cannot
  download installers, so nothing is installed on a running PAW.
- **Pinned versions** (2026-11-27): VS Code 1.148.0, Node.js 24.22.3 LTS
  (npm 11.19.1), pnpm 11.22.0, Git 2.56.1, Terraform 1.17.2. pnpm matches the
  `packageManager` pin of the project used on the PAW (ZBApp: pnpm@11.22.0),
  and Node.js 24 meets its `engines` requirement.
- **Every download is checked before it is installed.** It must match the
  checksum pinned in the script, and the Windows installers must carry a valid
  signature from the expected publisher (Microsoft, OpenJS Foundation,
  Johannes Schindelin for Git for Windows). Any mismatch fails the build. The
  pins come from the vendors' published checksums; the Node.js and Terraform
  checksum files were verified against the Node.js release keys and
  HashiCorp's signing key when the versions were pinned.
- **Switch:** `TF_VAR_INSTALL_DEV_TOOLS` in the shared `.env` (Packer variable
  `INSTALL_DEV_TOOLS`), default `true`; `false` leaves the tools out.
- **Settings for a PAW without internet:** VS Code self-update off and
  telemetry off (machine policy); Terraform's version check off
  (`CHECKPOINT_DISABLE=1`); npm's update, audit and funding lookups off
  (packages are audited before they are approved); Windows long paths on.
  Git uses VS Code as its editor, `main` as the default branch and the Windows
  certificate store for HTTPS.
- **pnpm and npm work in any PowerShell, including VS Code's terminal:** their
  `.ps1` launchers are removed, so PowerShell uses the `.cmd` launchers, which
  no execution policy blocks. No execution policy is changed.
- **Not in the image:** where npm/pnpm, Terraform and VS Code fetch packages,
  providers and extensions, and the certificate authority they trust. Those
  differ per environment and are deploy-time settings (the inside Artifact
  Keeper).
- **Each build records its contents** in `C:\ProgramData\Zenblox\paw-devtools.json`
  (version, download URL and checksum per tool).
- **Bumping a version:** change Version, Url, File and the checksum of that
  entry together, from the sources listed at the top of the script, then run a
  test build. The script is idempotent and can be run on a test VM first
  (tested 2026-11-27 on a throwaway VM from the same base image: all five
  tools installed and passed the smoke test; a second run skipped every
  install).

### Product decisions (Winget-Repo in the golden image)

- **Off by default since 2026-11-27.** The image build skips Winget-Repo unless
  `TF_VAR_INSTALL_WINGET_REPO=true` is set in the shared `.env` (Packer variable
  `INSTALL_WINGET_REPO`); PAW software comes from the image and Artifact Keeper
  instead. The notes below describe Winget-Repo when it is switched on.
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
    account `zenwingetpackages`, container `wingetrepo`), mints a
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
  the Microsoft-hosted AVD agent downloads, the developer-tool downloads from
  the vendors (checksum-pinned), and the package-archive blob download. The Winget-Repo SOFTWARE install itself is offline (pip
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