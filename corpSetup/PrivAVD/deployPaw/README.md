# Shared PAW AVD host pool

This folder is an independent Terraform state boundary. It consumes the
gallery and image definition created by the parent `PrivAVD` configuration and
does not modify the parent `init.tf` state.

The host pool contains exactly one multi-session host. `start_vm_on_connect`
starts the deallocated host when a user connects. Every day, the scaling plan
stays in ramp-down mode from 00:30 through 23:45 and deallocates the host when
it has zero active sessions. It does not interrupt active sessions. The narrow
midnight scheduling window is required by the AVD autoscale schedule model.
Terraform grants the Azure Virtual Desktop service principal the Desktop
Virtualization Power On Off Contributor role at this resource-group scope.

## Apply

Create a `terraform.tfvars` file locally or pass these values through a secure
variable mechanism. Do not commit credentials or the registration token.

```powershell
terraform init
terraform validate
terraform plan -out avd.tfplan
terraform apply avd.tfplan
```

When the selected Terraform workspace has no state, deployment automatically
scans Azure and imports existing PAW resources before planning. To force another
scan when state already exists, run:

```powershell
.\importPAW.ps1
```

The importer skips resources already in Terraform state, so it can safely resume
an interrupted import or apply. `.\deployPAW.ps1 -Import` forces this scan
before planning.

Required values are `subscription_id` and `image_version`. `image_version` must
be the exact version emitted by `..\buildImage\build.ps1`. Terraform generates the local
administrator password and stores it as sensitive state; it is not output.

The module creates the VNet, session-host subnet, and NSG in the AVD resource
group. Azure Firewall and its forced-egress route are temporarily commented out
in `network.tf`; session hosts use default Azure outbound access, while private
network egress remains denied by the NSG. Session hosts have no public IP, VNet
peering, or NAT gateway. This temporary setup does not restrict internet egress
to the AVD service allowlist.

The golden image contains Microsoft-signed AVD Agent and Boot Loader installers.
At deployment, Custom Script Extension runs the local registration script with
the short-lived host-pool token in protected settings. The retired PowerShell
DSC extension and its public configuration package are not used.

The hosts are Microsoft Entra joined, so no route to an external AD DS network
is required. Assign users the Virtual Machine User Login or Virtual Machine
Administrator Login role at the resource-group or VM scope in addition to the
AVD application-group assignment.

The current Compute Gallery definition is Gen2 but is not marked as Trusted
Launch supported, so its session host is deployed without Secure Boot or vTPM.
Enabling those features requires a Trusted Launch compatible image definition
and a newly published image version.

When using `..\deployPAW.ps1`, set the target name once as
`TF_VAR_HOST_POOL_NAME` in `..\.env`. Every Azure resource created by this module
uses that name. The existing Compute Gallery image is read through a
data source and remains in `TF_VAR_GALLERY_RG`; it is not created or moved by this
module. The script keeps a separate Terraform workspace for each target
resource group, preventing stale state from another group from being applied.
Set `TF_VAR_PAW_LOCATION` to the Azure region name, such as `eastus`. The script uses
that region for every created resource and selects only an image version that
has been replicated there.

Azure Firewall Standard has a material recurring cost. Its configuration is
temporarily commented out in `network.tf`; restore it when outbound traffic must
be restricted to approved service endpoints. No NAT gateway is configured in
this module.

## TODO

- [ ] Reassess pooled versus personal host pools before granting users local elevation.
- [ ] Add persistent user profiles and approved backup and restore support.
- [ ] Add Defender for Endpoint, centralized diagnostics, and security alerts.
- [ ] Validate firewall rules against Microsoft's complete required endpoint list.

## Design decisions

- Exactly one pooled, Microsoft Entra joined session host is deployed.
- Start VM on Connect starts the host; autoscale deallocates it when unused.
- Runtime resources are contained in the configured PAW resource group.
- Session hosts have no public IP and use default Azure outbound access while
	the firewall configuration is commented out.
- Private network egress from session hosts is denied by the NSG.
- The local administrator password is generated and retained only in Terraform state.
- Device redirection is pinned: no local drives, USB devices, printers, COM
  ports, phones or cameras in the session (several Microsoft defaults are ON).
- Clipboard: `CLIPBOARD_MODE` (`TF_VAR_CLIPBOARD_MODE`) is `paste-in` by default
  (plain text can be pasted into the PAW, nothing can be copied out); `two-way`
  is for testing only; `off` removes the clipboard. Enforced on the session host
  by `scripts/Set-PawRedirectionPolicy.ps1`; applies after the next restart.

- The gallery image is read as an external dependency and is not managed here.
- The PAW deployment has its own Terraform state and workspace per resource group.
- Planning happens before apply so proposed changes are visible and repeatable.
- Imports discover clearly identified existing resources and skip objects already in state.

## Artifact Keeper integration

To feed this PAW's winget from an Artifact Keeper stack (ZbArtifactKeeper), see
`docs/PAW-INTEGRATION.md` in that repo. In short: deployPaw creates (or reuses)
the `privatelink.blob.core.windows.net` zone and outputs
`private_endpoints_subnet_id` and `blob_private_dns_zone_id` for the AK `.env`.
Setting `TF_VAR_ARTIFACT_KEEPER_BLOB_HOST` makes the session hosts trust the AK
private blob host, so winget installs from it run unattended.

### Sign-in tasks: drive mapping and developer tools

With `TF_VAR_ARTIFACT_KEEPER_FILE_SHARE=true`, every user sign-in runs
`scripts/paw-signin/Invoke-PawSignIn.ps1`, hidden and as the user, started by
the HKLM Run key `ZenbloxPawSignIn`. Deployed by the `paw-signin` run command
(`scripts/Install-PawSignIn.ps1`) into `C:\ProgramData\Zenblox\PawSignIn`,
which users can read but not change.

1. **Drive:** maps `\\<account>.file.core.windows.net\<share>` to
   `ARTIFACT_KEEPER_DRIVE_LETTER` (default `P`), retrying while the cloud
   Kerberos ticket arrives. Not persistent, so no stale reconnect.
2. **Developer tools** (`PAW_USER_TOOLS`, default true): installs, for that user
   only and without admin rights, the tools listed in
   `Installers\paw-user-tools.json` on the share. Starting list:
   `user-tools/paw-user-tools.json` (VS Code, Git, Node.js with npm, pnpm,
   Terraform). Each file is copied from the share, its SHA-256 checked against
   the list (a mismatch is refused), installed into the user's profile, and
   smoke-tested. Later sign-ins skip tools that are already current (a few
   seconds). The first sign-in takes about 5 minutes; tools appear in new
   terminals once it is done.
   Logs: `%LOCALAPPDATA%\Zenblox\logs\paw-signin.log` and `paw-user-tools.log`.

**Share layout** (folders are the Artifact Keeper artifact paths; the publish
job copies them to the share unchanged):

```
Installers\paw-user-tools.json                 the tool list
Installers\<Tool>\<version>\<installer file>   one folder per tool and version
Manifests\                                     winget manifests (machine installs, later)
```

**Adding or updating a tool:** upload the installer to Artifact Keeper under
`Installers/<Tool>/<version>/`, add or change its entry in
`paw-user-tools.json` (version, file, `sha256` = the artifact's
`checksum_sha256`), upload the list, and run the publish job. Users get it at
their next sign-in. Entry types: `exe` (vendor installer that installs per user,
run with `args`), `zip` (unpacked into
`%LOCALAPPDATA%\Programs\Zenblox\<folder>`, added to the user's PATH), `npm`
(a package `.tgz` installed into another tool's folder, e.g. pnpm into Node.js).
The list order is the install order.

With user tools on, the session host also gets the machine policies the tools
need without internet: VS Code updates and telemetry off, Windows long paths
on. Tested 2026-11-27 on a throwaway VM from the same base image with
standard (non-admin) users: first sign-in installed all five tools in about
5 minutes, a second sign-in took 5 s, and a changed checksum was refused.
