# Privileged Access Workstation on Azure Virtual Desktop

This folder creates a hardened Windows image and deploys one isolated Azure
Virtual Desktop PAW session host. Run the wrapper scripts from this folder.

Read [PAW design principles](designPrinciples.md) before changing the security,
identity, networking, image, persistence, or recovery design.

## Prerequisites

- Sign in with Azure CLI using `az login`.
- Install Terraform and Packer.
- Copy `.env.example` to `.env` and review every value, including the
  `TF_STATE_*` remote state settings.
- Ensure the signed-in identity can manage the subscription and required Entra groups.

## Deploy

Run the stages in order.

### 1. Initialize the image gallery

```powershell
.\init.ps1
```

This creates or imports the gallery resource group, Azure Compute Gallery, and
image definition.

### 2. Build the PAW image

```powershell
.\build.ps1
```

This hardens and generalizes Windows, then publishes a new timestamped image
version to the gallery. The image includes Microsoft-signed AVD Agent and Boot
Loader installers plus the local registration script used after deployment.

### 3. Review and deploy the PAW

Create a plan without applying it:

```powershell
.\deployPAW.ps1 -PlanOnly
```

Review the output, then deploy:

```powershell
.\deployPAW.ps1
```

The deployment selects the newest image version replicated to
`TF_VAR_PAW_LOCATION`.

## Import existing resources

Imports are intentionally conservative. They import only resources that can be
matched clearly from `.env` and fixed names, and skip resources already in state.

```powershell
.\importPAW.ps1
```

You can also import and then continue with deployment:

```powershell
.\deployPAW.ps1 -Import
```

The importer can resume partial state and ignores discovered resources that are
not declared by the current Terraform configuration. Ambiguous Entra groups are
not imported automatically.

## Terraform state

State is remote, in the storage account from `TF_STATE_*` (see
`tfBackend.ps1`), so runs from different machines and GitHub runners share it:

- Gallery: blob `privavd-gallery-<TF_VAR_GALLERY_RG>.tfstate`
- PAW: blob `privavd-paw.tfstate`, one Terraform workspace per PAW resource
  group (stored as `privavd-paw.tfstateenv:<resource group>`)

### One-time migration of existing local state

If you deployed before state was remote, copy your local state up once. Run
each command from its folder and answer `yes` when Terraform asks to copy:

```powershell
cd initImageGallery
terraform init -migrate-state @(& ..\tfBackend.ps1 -Key "privavd-gallery-<TF_VAR_GALLERY_RG>.tfstate")
cd ..\deployPaw
terraform init -migrate-state @(& ..\tfBackend.ps1 -Key privavd-paw.tfstate)
```

`deployPAW.ps1` runs with `-input=false`, so it fails with "Can't ask approval
for state migration" until this is done; do not remove that flag.

Then delete the leftover local files, which still contain secrets such as the
generated local administrator password:

```powershell
.\deleteLocalTfState.ps1
```

It does not delete Azure or Entra resources, and it does not touch the remote
state.

### Resetting state

Deleting remote state does not delete online resources either. Before
applying against resources that still exist online with empty state, choose
one recovery path:

1. Import the small set of clearly matched existing resources into empty state.
2. Back up and verify all PAW user data, delete the affected online resource
    group, import surviving Entra groups, and recreate the PAW with the normal
    workflow.

## Data-loss warning

The PAW infrastructure is disposable, but its user data is not. Users are
expected to install administrative tools and keep administrative working data
on the PAW host. This repository does not yet configure persistent user profiles
or automatic user-data backup.

> **Warning:** Before deleting or recreating the PAW resource group, back up all
> user data from the PAW host and verify that the backup can be restored. Include
> Desktop, Documents, Downloads, administrative data, tool configuration, keys,
> scripts, and any application-local storage that must be retained.

Deleting or replacing the VM, its OS disk, or the PAW resource group permanently
removes any local tools, profiles, configuration, and data that were not backed
up.

Autoscale deallocation is different from deletion: deallocation stops compute
billing but retains the VM and OS disk. Building a new image also does not copy
user data from an existing session host.

Backups must use an approved external service that is explicitly allowed by the
PAW network policy.

## TODO

- [ ] Store PAW user data and profile configuration in a persistent service that
    can be backed up and restored easily onto a newly created PAW host.
- [ ] Decide whether administrators who need local elevation require personal
    session hosts instead of the current pooled host.
- [ ] Establish image patching, security monitoring, and restore-testing procedures.

## Folder responsibilities

- `initImageGallery` creates the gallery resource group, gallery, and image definition.
- `buildImage` builds and publishes immutable PAW image versions.
- `deployPaw` creates the isolated AVD control plane, network, and single session host.
- Top-level scripts are short wrappers around implementations in those folders.

## Design decisions

- Image versions are immutable; each build publishes a new version.
- New PAW deployments are born locked: no default outbound access, an NSG
  egress allow-list of Microsoft service tags, an AVD Private Link connection
  private endpoint, and a host pool restricted to `EnabledForSessionHostsOnly`.
  Windows Update still works over the `AzureCloud` tag with Delivery
  Optimization in HTTP-only mode.
- Image builds use a Trusted Launch gallery definition; session hosts boot
  with Secure Boot and vTPM enabled.
- Deallocation is used for cost control and does not mean deletion.
- The PAW runtime resource group is replaceable, but local user data requires
    backup before recreation.

- Image initialization, image building, and PAW deployment are separate stages.
- Gallery and PAW deployment state are kept separate.
- Configuration is shared through uppercase `TF_VAR_*` values in `.env`.
- State is remote (`TF_STATE_*`); deleting state never deletes online resources.
- Imports are deliberately limited and require empty state.
- Importing too little is preferred to managing an unrelated online resource.
- Broken online environments are removed as complete resource groups, not patched piecemeal.
