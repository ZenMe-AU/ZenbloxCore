# Winget-Repo playground VM

Throwaway Windows 11 VM running [Winget-Repo](https://github.com/dev-fYnn/Winget-Repo)
so it can be evaluated hands-on before deciding how a private package
repository should fit the PrivAVD / PAW story (see `../PrivAVD`).

Created 2026-10-20. Delete the whole resource group when the evaluation is
done - nothing else depends on it:

```powershell
az group delete -n erv1-wingetrepo-play-rg --no-wait
```

## Design decisions

- Purpose is hands-on evaluation only. This VM is NOT part of the PrivAVD
  golden image work; that track is decided separately (the agreed direction
  there is a baked-localhost repo inside the golden image).
- Winget-Repo pinned to V2.9.2 (the version of the reference install).
- Runs as `python main.py /docker`: binds all interfaces, HTTPS on :5000.
- TLS: a pre-generated 10-year self-signed pair (SAN: the VM DNS label +
  localhost + 127.0.0.1) was baked into `C:\Winget-Repo\Config\SSL\`. The app
  reuses existing pairs instead of generating its own. Without the baked
  pair the app auto-generates a 365-day localhost-only pair.
- Autostart via Task Scheduler (onstart, SYSTEM). NSSM was tried first, but
  nssm.cc returns HTTP 503 from Azure IP ranges - do not depend on nssm.cc
  from Azure VMs.
- The shipped Winget-Repo database has zero users by design: the first
  dashboard visit creates the admin account, so no credentials are baked
  into the image or scripts.
- Access: the NSG allows inbound 5000 from named source IPs only. There is
  deliberately no RDP port - the VM is managed entirely through Azure
  run-command. Break-glass local admin credentials (console-only use) are
  kept on the deployer's machine, not in this repo.

## Delivery process decisions

- Region southafricanorth (next to the PrivAVD stack), Standard_B2s,
  Win11 24H2 AVD marketplace image, Trusted Launch enabled. The playground
  lives in its own resource group so teardown is a single command.
- Windows' 15-character computer name limit forced the short VM name
  `erv1-wgr-play`; the public DNS label is the full
  `erv1-wingetrepo-play.southafricanorth.cloudapp.azure.com`.
- Deploy: `deploy.ps1 -adminIp <your public IP>` (creates RG, VNet, NSG,
  public IP with DNS label, NIC, VM; writes break-glass creds to
  `%USERPROFILE%\hermes_scratch\`).
- Setup on the VM: run `setup.ps1` through Azure run-command. Payload
  delivery is the fragile part; the working shapes are:
  - single-line scripts with single quotes only:
    `az vm run-command invoke -g <rg> -n <vm> --command-id RunPowerShellScript --scripts '<one line>'`
    (multi-line payloads get mangled through the az.cmd shim, and
    `--scripts` is nargs+ - unquoted spaces split into separate script
    lines)
  - or `az rest --method post --url .../virtualMachines/<vm>/runCommand?api-version=<v> --body @body.json`
    with the script as a JSON line array (reliable delivery; note newer API
    versions return 202 and swallow stdout - get state back with
    single-line probes instead)
- VM agent commands take minutes and a second run-command while one is in
  progress fails with Conflict ("execution is in progress").

## Handover notes

- Dashboard: `https://erv1-wingetrepo-play.southafricanorth.cloudapp.azure.com:5000`
  (first visit = create the admin account).
- Adding a reviewer's IP:
  `az network nsg rule create -g erv1-wingetrepo-play-rg --nsg-name wingetplay-nsg -n Allow-5000-Reviewer --priority 110 --direction Inbound --access Allow --protocol Tcp --source-address-prefixes <IP>/32 --destination-port-ranges 5000`
- Cost control: deallocate when idle (`az vm deallocate -g erv1-wingetrepo-play-rg -n erv1-wgr-play`);
  a guest-OS shutdown does NOT stop billing.
- Testing from a client machine: import the TLS cert into the machine's
  Root store, then
  `winget source add -n Winget-Repo -t Microsoft.Rest -a https://erv1-wingetrepo-play.southafricanorth.cloudapp.azure.com:5000/api/`