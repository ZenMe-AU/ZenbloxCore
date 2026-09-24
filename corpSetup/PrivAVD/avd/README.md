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

Required values are `subscription_id` and `image_version`. `image_version` must
be the exact version emitted by `..\build.ps1`. Terraform generates the local
administrator password and stores it as sensitive state; it is not output.

The module creates the VNet, subnets, NSG, route table, Azure Firewall, and
firewall policy in the AVD resource group. Session hosts have no public IP,
VNet peering, NAT gateway, or default Azure outbound access. All default-route
traffic is forced through Azure Firewall. Its allowlist contains only the AVD
control plane, Microsoft Entra ID, regional Azure Storage needed to install VM
extensions, and Azure KMS activation. Windows Update is not allowed.

The hosts are Microsoft Entra joined, so no route to an external AD DS network
is required. Assign users the Virtual Machine User Login or Virtual Machine
Administrator Login role at the resource-group or VM scope in addition to the
AVD application-group assignment.

The current Compute Gallery definition is Gen2 but is not marked as Trusted
Launch supported, so its session host is deployed without Secure Boot or vTPM.
Enabling those features requires a Trusted Launch compatible image definition
and a newly published image version.

When using `..\deployPAW.ps1`, set the target resource group once as
`AVD_RESOURCE_GROUP` in `..\.env`. Every Azure resource created by this module
uses that resource group. The existing Compute Gallery image is read through a
data source and remains in `GALLERY_RG`; it is not created or moved by this
module. The script keeps a separate Terraform workspace for each target
resource group, preventing stale state from another group from being applied.

Azure Firewall Standard has a material recurring cost. This is intentional: an
NSG alone cannot restrict encrypted outbound traffic by required AVD FQDNs.