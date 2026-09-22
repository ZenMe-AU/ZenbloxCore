# TODO: Add packer installer to the deployLocalDependencies script from ZBReact.
#winget install -e --id Hashicorp.Packer

packer init paw-image.pkr.hcl
packer validate paw-image.pkr.hcl
packer inspect paw-image.pkr.hcl
packer build paw-image.pkr.hcl
