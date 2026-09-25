# TODO: Add packer installer to the deployLocalDependencies script from ZBReact.
#winget install -e --id Hashicorp.Packer

packer init
packer validate speedify-image.pkr.hcl
packer inspect speedify-image.pkr.hcl
packer build speedify-image.pkr.hcl

terraform apply

# ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 azureuser@74.235.64.1 "hostname && lsb_release -ds"