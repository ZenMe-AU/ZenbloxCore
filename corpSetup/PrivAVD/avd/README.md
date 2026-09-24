# Shared PAW AVD host pool

This folder is an independent Terraform state boundary. It consumes the
gallery and image definition created by the parent `PrivAVD` configuration and
does not modify the parent `init.tf` state.

The host pool is pooled and multi-session. `start_vm_on_connect` starts a
deallocated session host when a user connects. The scaling plan deallocates
unused hosts outside the weekday usage window. Azure Virtual Desktop starts
only one host every five minutes with Start VM on Connect, so keep at least one
host available during periods where multiple simultaneous first connections
are expected.

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

Azure Firewall Standard has a material recurring cost. This is intentional: an
NSG alone cannot restrict encrypted outbound traffic by required AVD FQDNs.