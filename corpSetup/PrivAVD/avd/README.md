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

Required values are `subscription_id`, `subnet_id`, `image_version`,
`administrator_password`, `domain_name`, `domain_join_username`, and
`domain_join_password`. `image_version` must be the exact version emitted by
`..\build.ps1`.

The subnet must provide DNS resolution and network access to the AD DS domain
controllers. The domain-join extension assumes traditional AD DS; replace that
extension with an Entra join or Entra Domain Services approach if the target
network does not provide AD DS.