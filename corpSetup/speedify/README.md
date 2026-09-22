# Speedify Self-Hosted Server

This Terraform configuration provisions the Azure host and installs the
Speedify Self-Hosted Server Docker service.

## Requirements

- Azure CLI authenticated to the target subscription
- Terraform 1.1 or newer
- A Speedify Self-Hosted Server license
- A VM admin password supplied through `TF_VAR_admin_password`
- A budget notification email supplied through `TF_VAR_contact_emails`

The VM uses `Standard_B1ms` (1 vCPU, 1 GB RAM), a static public IP, and the
Speedify-required inbound ports:

- TCP 8443
- TCP 32768-65535
- UDP 32768-65535

## Deploy

From this directory:

```powershell
$env:TF_VAR_admin_password = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
$env:TF_VAR_contact_emails = "jake.vosloo@zenme.com.au"
terraform init
terraform plan -out=tfplan
terraform apply tfplan
terraform output -raw speedify_public_ip
```

The VM extension installs Docker, writes `/opt/speedify-server/docker-compose.yml`,
pulls `speedify/ss-manager:latest`, and starts it automatically.

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