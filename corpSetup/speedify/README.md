# Speedify Self-Hosted Server

This Terraform configuration provisions the Azure host from a pre-baked
Packer image. **Terraform performs zero installations at runtime** — Docker,
Docker Compose v2, the Speedify `docker-compose.yml`, the default `.env`, and
the pulled `speedify/ss-manager:latest` image are all baked into the 
image by Packer. At boot, cloud-init only waits for the Docker daemon, stamps
the VM's real public IP (from Azure IMDS) into `.env`, and runs
`docker compose up -d`.

## Configuration (corp.env)

All Azure values live in `../corp.env` — the single source of truth for the
whole corp. The Speedify keys:

| Key | Used by | Meaning |
|---|---|---|
| `SUBSCRIPTION_ID` | build.ps1, speedify.tf | Target subscription |
| `SPEEDIFY_LOCATION` | build.ps1, speedify.tf | Azure region |
| `SPEEDIFY_RESOURCE_GROUP` | build.ps1, speedify.tf | RG for image, gallery and VM |
| `SPEEDIFY_GALLERY_NAME` | build.ps1, speedify.tf | Compute Gallery name |
| `SPEEDIFY_IMAGE_NAME` | build.ps1, speedify.tf | Gallery image definition |
| `SPEEDIFY_IMAGE_VERSION` | build.ps1 | Version to publish (override with `-ImageVersion`) |
| `SPEEDIFY_BUILD_VM_SIZE` | build.ps1 | Temp VM size during the image build |
| `SPEEDIFY_SERVER_NAME` | install script | Default server name baked into `.env` |

`build.ps1` reads these, verifies the subscription against the active
`az login` session, and passes them to Packer as `-var` flags. The Packer
template has **no defaults** — a missing corp.env key fails the build
immediately. Terraform receives the same values via `TF_VAR_*` environment
variables (see the Deploy section).

The VM uses a static public IP and the Speedify-required inbound ports:

- TCP 8443
- TCP 32768-65535
- UDP 32768-65535

## Build the image

`speedify-image.pkr.hcl` receives all naming from `build.ps1` (which reads
`corp.env`). The build:

1. Uploads `docker-compose.yml` (the repo source of truth) to `/tmp`
2. Runs `install-speedify-server.sh`, which installs Docker + Docker Compose
   v2, bakes `/opt/speedify-server` (copies the uploaded `docker-compose.yml`
   + writes a default `.env` with `PUBLIC_IP=auto` and `SERVER_NAME` from
   corp.env) and pulls `speedify/ss-manager:latest`
3. Runs `activate-speedify-server.sh`, which starts the stack, prints the
   Speedify **activation URL** in the console and **waits** while you open it
   in a browser, sign in to your Speedify account and attach the
   Self-Hosted Server license. Press ENTER in the terminal after the browser
   flow completes; the script confirms activation from the logs, stops the
   stack, and the activated state is baked into the image. Pass
   `-SkipActivation` to skip this step (image stays unactivated).
4. Deprovisions the waagent so the image is reusable

The image is IP-agnostic: the compose file keeps `${public_ip}` /
`${server_name}` as compose interpolation variables (compose auto-reads
`.env`), so the same image works on any VM.

```powershell
.\build.ps1                     # rebuild version 1.0.0 (default from pkr.hcl)
.\build.ps1 -ImageVersion 1.0.1 # rebuild a specific version
.\build.ps1 -SkipVersionDelete  # keep the existing version (fails if it exists)
.\build.ps1 -SkipActivation     # skip the interactive activation step
```

> The build VM size is configurable via `SPEEDIFY_BUILD_VM_SIZE` in corp.env
> (currently `Standard_B1ms`).

The pipeline reads corp.env, verifies the subscription against the active
`az login` session, ensures the gallery + image definition exist, deletes the
existing version + stale managed image (overwrite, not fail), runs the Packer
build, and reports the version JSON.
Authentication uses `use_azure_cli_auth = true` (requires `az login`).

Verified end-to-end: version `1.0.0` published to gallery `zenblox`
(RG `speedify2`) with `provisioningState: Succeeded`:

```
/subscriptions/51d0ca21-eaa5-4d34-aeb3-fa9f7d454b5d/resourceGroups/speedify2/providers/Microsoft.Compute/galleries/zenblox/images/speedify/versions/1.0.0
```

## Deploy

Terraform boots the VM from the gallery image via the
`azurerm_shared_image` data source — no `custom_image_id` variable is needed.
The gallery naming comes from corp.env via `TF_VAR_*` environment variables.
From this directory:

```powershell
$env:TF_VAR_admin_password = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
$env:TF_VAR_contact_emails = "jake.vosloo@zenme.com.au"
# Gallery naming from corp.env (single source of truth):
$env:TF_VAR_subscription_id      = (Get-Content ..\corp.env | Where-Object { $_ -match '^SUBSCRIPTION_ID=' }) -replace '^SUBSCRIPTION_ID=', ''
$env:TF_VAR_speedify_resource_group = (Get-Content ..\corp.env | Where-Object { $_ -match '^SPEEDIFY_RESOURCE_GROUP=' }) -replace '^SPEEDIFY_RESOURCE_GROUP=', ''
$env:TF_VAR_location             = (Get-Content ..\corp.env | Where-Object { $_ -match '^SPEEDIFY_LOCATION=' }) -replace '^SPEEDIFY_LOCATION=', ''
$env:TF_VAR_gallery_name         = (Get-Content ..\corp.env | Where-Object { $_ -match '^SPEEDIFY_GALLERY_NAME=' }) -replace '^SPEEDIFY_GALLERY_NAME=', ''
$env:TF_VAR_image_name           = (Get-Content ..\corp.env | Where-Object { $_ -match '^SPEEDIFY_IMAGE_NAME=' }) -replace '^SPEEDIFY_IMAGE_NAME=', ''
terraform init
terraform plan -out=tfplan
terraform apply tfplan
terraform output -raw speedify_public_ip
```

At first boot, cloud-init (baked into the VM config, not the image):

1. Waits for the Docker daemon to accept connections
2. Queries the VM's real public IP from Azure IMDS and stamps it into
   `/opt/speedify-server/.env` (`PUBLIC_IP=...`)
3. Runs `docker compose up -d`

## Activate

Activation is intentionally manual because Speedify links the server to an
account and license through an activation URL or QR code shown by the service:

```bash
sudo docker compose -f /opt/speedify-server/docker-compose.yml logs -f
```

Open the activation URL, sign in, and attach the Self-Hosted Server license.
After activation, restart the service and confirm it is running:

```bash
sudo docker compose -f /opt/speedify-server/docker-compose.yml restart
sudo docker compose -f /opt/speedify-server/docker-compose.yml ps
```

Do not commit `terraform.tfstate` or any password values. The state file can
contain sensitive VM credentials and should be moved to an encrypted remote
backend before this is used beyond initial setup.