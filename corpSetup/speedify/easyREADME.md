# How To Use The Speedify Server Setup.

This is the simple, step-by-step guide. For the technical details, see
`README.md`.

---


There are two parts that work together:

1. **The image** (made by Packer) — a "template computer" with everything
   already installed: Docker, Docker Compose, the Speedify server files, and
   the Speedify program itself. It lives in an Azure "gallery" called
   `zenblox` under the name `speedify`, version `1.0.0`.
2. **The virtual machine** (made by Terraform) — a real running computer in
   Azure that is created FROM that image. When it starts, it fills in its own
   public IP address and starts the Speedify program. **Nothing is installed
   when the VM starts** — everything was already put inside the image.

---

## Step 1 — One-time setup (only needed once per terminal session)

Open a terminal in `d:\code\ZBCorpArchitecture\corpSetup\speedify` and run:

```powershell
Set-Location d:\code\ZBCorpArchitecture\corpSetup\speedify
az login
```

A browser window opens — sign in to the "Zenme Azure 1" account.

---

## Step 2 — Build (or rebuild) the image

This creates the image. It takes about 12–15 minutes. You only need
to do this when the recipe changes (new Speedify version, new settings, etc.):

```powershell
.\build.ps1
```

**During the build the terminal will pause and show a Speedify activation
URL.** Open that URL in a browser, sign in to your Speedify account and
attach the Self-Hosted Server license. Then go back to the terminal and
press ENTER. The build confirms the activation and bakes it into the image —
so every server created from this image is **already activated**.

(To skip this step, run `.\build.ps1 -SkipActivation` — the image is then
built without a license and must be activated manually later, see Step 4.)

When it finishes you will see `Pipeline complete.` and a JSON block that says
`"provisioningState": "Succeeded"`. That means the new image is ready.

---

## Step 3 — Create the virtual machine

This turns the image into a real running server:

```powershell
$env:TF_VAR_admin_password = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
$env:TF_VAR_contact_emails = "jake.vosloo@zenme.com.au"
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

The first command asks you to type the VM admin password (you'll use it to
log in later — remember it).

Get the server's public IP address:

```powershell
terraform output -raw speedify_public_ip
```

Write this IP down — Speedify clients connect to it.

---

## Step 4 — Activate the Speedify license (only if built with -SkipActivation)

If the image was built normally, the license was already activated during
Step 2 and this step is **not needed**. Only do this if the image was built
with `-SkipActivation` (or activation must be redone on a running server).

Connect to the server (use the IP from Step 3 and the password from Step 3):

```powershell
ssh azureuser@<THE_PUBLIC_IP>
```

Then watch the Speedify logs for an activation link:

```bash
sudo docker compose -f /opt/speedify-server/docker-compose.yml logs -f
```

An activation URL appears in the logs. Open it in a browser, sign in to your
Speedify account, and attach your Self-Hosted Server license. Then restart
the service and check it is running:

```bash
sudo docker compose -f /opt/speedify-server/docker-compose.yml restart
sudo docker compose -f /opt/speedify-server/docker-compose.yml ps
```

Done. Clients can now connect to `<THE_PUBLIC_IP>` on port 8443.

---

## How to update to a NEW image version later

When you want to ship a new image (for example a newer Speedify release):

**1. Build the new version** (use a higher version number):

```powershell
.\build.ps1 -ImageVersion 1.0.1
```

**2. Replace the old server with one built from the new image:**

```powershell
terraform plan -out=tfplan
terraform apply tfplan
```

Terraform notices the gallery now has version 1.0.1, deletes the old VM, and
creates a fresh one from the new image. The public IP stays the same because
it is a separate static IP resource.

**3. Re-activate the license** (Step 4 again) — a fresh VM has a fresh
Speedify install, so it shows a new activation link. (If the new image was
built with activation included, this is not needed.)

> **Note:** if you rebuild the SAME version number (e.g. `.\build.ps1` again
> with 1.0.0), Terraform sees "nothing changed" and will NOT replace the VM.
> To force the existing VM to be rebuilt from the refreshed image, run:
>
> ```powershell
> terraform apply -replace="azurerm_linux_virtual_machine.speedify"
> ```

---

## Everyday commands cheat sheet

| What you want to do | Command |
|---|---|
| Build image (same version, overwrite) | `.\build.ps1` |
| Build image (new version) | `.\build.ps1 -ImageVersion 1.0.1` |
| Build image (skip license activation) | `.\build.ps1 -SkipActivation` |
| Create / update the VM | `terraform apply tfplan` (after `plan -out=tfplan`) |
| Get the server IP | `terraform output -raw speedify_public_ip` |
| Log in to the server | `ssh azureuser@<THE_PUBLIC_IP>` |
| See Speedify logs (activation link) | `sudo docker compose -f /opt/speedify-server/docker-compose.yml logs -f` |
| Check Speedify is running | `sudo docker compose -f /opt/speedify-server/docker-compose.yml ps` |
| Restart Speedify | `sudo docker compose -f /opt/speedify-server/docker-compose.yml restart` |
| Force-rebuild VM from current image | `terraform apply -replace="azurerm_linux_virtual_machine.speedify"` |
| Destroy everything (stop paying) | `terraform destroy` |

---

## What is inside the image

- Ubuntu 24.04
- Docker + Docker Compose v2
- `/opt/speedify-server/docker-compose.yml` (the Speedify server definition)
- `/opt/speedify-server/.env` (settings file; the real IP is filled in at boot)
- The Speedify server program (`speedify/ss-manager`), already downloaded

## What happens when a VM starts (automatic, no installs)

1. Azure creates the VM from the image.
2. A small startup script waits for Docker to be ready.
3. It asks Azure "what is my public IP?" and writes it into `.env`.
4. It runs `docker compose up -d` — Speedify starts.

That's it. No downloads, no installs, no scripts at VM start-up.