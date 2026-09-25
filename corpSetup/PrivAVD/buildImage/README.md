# PAW image build

This folder builds and publishes the Windows golden image used by the PAW Azure
Virtual Desktop deployment. Run it through the parent wrapper:

```powershell
..\build.ps1
```

Configuration is loaded from the shared parent `.env` file. The gallery and
image definition must already exist.

## TODO

- [ ] Add a controlled image patching process and validate rebuilt images before
  replacing the PAW session host.

## Design decisions

- The source is the latest Windows 11 multi-session AVD image.
- Hardening runs before the VM is restarted and generalized.
- Each build publishes a new immutable timestamped image version.
- The image is replicated to the configured PAW region.
- Windows Update is not run unless its Packer provisioner is explicitly enabled.

- Packer builds the image; Terraform only creates the gallery prerequisites.
- Azure CLI authentication is reused instead of storing build credentials.
- Relative build scripts are resolved by running Packer from this folder.
