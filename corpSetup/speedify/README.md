# Speedify Self-Hosted Server

This Terraform configuration provisions the Azure host from a pre-baked
Packer image. **Terraform performs zero installations at runtime** — Docker,
Docker Compose v2, the Speedify `docker-compose.yml`, the default `.env`, and
the pulled `speedify/ss-manager:latest` image are all baked into the 
image by Packer. At boot, cloud-init only waits for the Docker daemon, stamps
the VM's real public IP (from Azure IMDS) into `.env`, and runs
`docker compose up -d`.

## Requirements

- Azure CLI authenticated to the target subscription
- Terraform 1.1 or newer
- Packer 1.11 or newer (for building the  image)
- A Speedify Self-Hosted Server license
- A VM admin password supplied through `TF_VAR_admin_password`
- A budget notification email supplied through `TF_VAR_contact_emails`

The VM uses `Standard_B1ms` (1 vCPU, 1 GB RAM), a static public IP, and the
Speedify-required inbound ports:

- TCP 8443
- TCP 32768-65535
- UDP 32768-65535

## Build the image

`speedify-image.pkr.hcl` is the single source of truth for the gallery
naming. The build:

1. Installs Docker + Docker Compose v2 (`install-speedify-server.sh`)
2. Bakes `/opt/speedify-server/docker-compose.yml` + a default `.env`
   (`PUBLIC_IP=auto`, `SERVER_NAME=<server_name>`) and pulls
   `speedify/ss-manager:latest`
3. Deprovisions the waagent so the image is reusable

The image is IP-agnostic: the compose file keeps `${public_ip}` /
`${server_name}` as compose interpolation variables (compose auto-reads
`.env`), so the same image works on any VM.

```powershell
.\build.ps1                     # rebuild version 1.0.0 (default from pkr.hcl)
.\build.ps1 -ImageVersion 1.0.1 # rebuild a specific version
.\build.ps1 -SkipVersionDelete  # keep the existing version (fails if it exists)
```

The pipeline parses the gallery naming from the HCL, ensures the gallery +
image definition exist, deletes the existing version + stale managed image
(overwrite, not fail), runs the Packer build, and reports the version JSON.
Authentication uses `use_azure_cli_auth = true` (requires `az login`).

Verified end-to-end: version `1.0.0` published to gallery `zenblox`
(RG `speedify2`) with `provisioningState: Succeeded`:

```
/subscriptions/51d0ca21-eaa5-4d34-aeb3-fa9f7d454b5d/resourceGroups/speedify2/providers/Microsoft.Compute/galleries/zenblox/images/speedify/versions/1.0.0
```

## Deploy

Terraform boots the VM from the gallery image via the
`azurerm_shared_image` data source (gallery `zenblox`, image `speedify`) —
no `custom_image_id` variable is needed. From this directory:

```powershell
$env:TF_VAR_admin_password = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
$env:TF_VAR_contact_emails = "jake.vosloo@zenme.com.au"
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