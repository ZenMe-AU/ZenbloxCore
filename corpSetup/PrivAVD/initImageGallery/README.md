

## Setup

Provision prerequisite Azure resources with Terraform, then build the golden
image with Packer. Do not use the Azure CLI directly (`az group create`,
`az resource create`, etc.) to manage these resources — Terraform and Packer
are the only supported tools, so state stays consistent and reproducible.

```powershell
terraform init
terraform apply

..\buildImage\build.ps1
```

## References:
https://getnerdio.com/blog/privileged-access-workstation-avd-windows-365/


Prepare your .env file
Run files in this order
init.ps1
buildImage\build.ps1
deployPAW.ps1

## TODO

- [ ] Replace the image definition with a Trusted Launch compatible definition
  after planning migration of existing image versions and session hosts.

## Design decisions

- The gallery resource group and gallery use the same configured name.
- The image definition is Windows, generalized, and Generation 2.

- Terraform owns the gallery resource group, gallery, and image definition.
- Packer owns image versions; Terraform does not publish image content.
- Gallery infrastructure has separate state from the PAW deployment.