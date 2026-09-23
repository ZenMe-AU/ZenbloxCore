

## Setup

Provision prerequisite Azure resources with Terraform, then build the golden
image with Packer. Do not use the Azure CLI directly (`az group create`,
`az resource create`, etc.) to manage these resources — Terraform and Packer
are the only supported tools, so state stays consistent and reproducible.

```powershell
terraform init
terraform apply

.\build.ps1
```

## References:
https://getnerdio.com/blog/privileged-access-workstation-avd-windows-365/


Prepare your .env file
Run files in this order
init.ps1
build.ps1
deployPAW.ps1