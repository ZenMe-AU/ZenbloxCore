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

To import existing resources, run the standalone importer before deployment:

```powershell
..\importPAW.ps1
```

The importer skips resources already in Terraform state, so it can safely resume
an interrupted import or apply. Running `..\deployPAW.ps1 -Import` delegates to
the same script before planning.

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

When using `..\deployPAW.ps1`, set the target resource group once as
`TF_VAR_PAW_RG` in `..\.env`. Every Azure resource created by this module
uses that resource group. The existing Compute Gallery image is read through a
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

- The gallery image is read as an external dependency and is not managed here.
- The PAW deployment has its own Terraform state and workspace per resource group.
- Planning happens before apply so proposed changes are visible and repeatable.
- Imports discover clearly identified existing resources and skip objects already in state.