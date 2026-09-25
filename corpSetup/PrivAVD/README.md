# Privileged Access Workstation on Azure Virtual Desktop

This folder creates a hardened Windows image and deploys one isolated Azure
Virtual Desktop PAW session host. Run the wrapper scripts from this folder.

Read [PAW design principles](designPrinciples.md) before changing the security,
identity, networking, image, persistence, or recovery design.

## Prerequisites

- Sign in with Azure CLI using `az login`.
- Install Terraform and Packer.
- Copy `.env.example` to `.env` and review every value.
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
version to the gallery.

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

Imports are intentionally conservative. They require empty deployment state and
only import resources that can be matched clearly from `.env` and fixed names.

```powershell
.\importPAW.ps1
```

You can also import and then continue with deployment:

```powershell
.\deployPAW.ps1 -Import
```

Do not use import to repair partial or uncertain state. If the online PAW
environment is inconsistent, delete the complete PAW resource group and deploy
it again. Entra groups are outside that resource group, so import those groups
into empty state before redeploying. This avoids accidentally placing unrelated
resources under this Terraform state.

## Delete local Terraform state

```powershell
.\deleteLocalTfState.ps1
```

This deletes local `terraform.tfstate` and backup files beneath this folder. It
does not delete Azure or Entra resources. It affects both gallery and PAW local
state when those files exist.

After deleting state, do not apply immediately against resources that still
exist online. Choose one recovery path first:

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

## Folder responsibilities

- `initImageGallery` creates the gallery resource group, gallery, and image definition.
- `buildImage` builds and publishes immutable PAW image versions.
- `deployPaw` creates the isolated AVD control plane, network, and single session host.
- Top-level scripts are short wrappers around implementations in those folders.

## Design decisions

- Image initialization, image building, and PAW deployment are separate stages.
- Gallery and PAW deployment state are kept separate.
- Configuration is shared through uppercase `TF_VAR_*` values in `.env`.
- Image versions are immutable; each build publishes a new version.
- The PAW runtime resource group is disposable and recreated instead of repaired.
- Imports are deliberately limited and require empty state.
- Importing too little is preferred to managing an unrelated online resource.
- Local state deletion never deletes online resources.
- Broken online environments are removed as complete resource groups, not patched piecemeal.
- The infrastructure is replaceable, but local user data requires backup before recreation.
- Deallocation is used for cost control and does not mean deletion.
- Network access is denied by default and only required PAW services are allowed.
