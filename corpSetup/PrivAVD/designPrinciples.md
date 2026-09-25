# PAW design principles

This document records the security and operational principles for this Azure
Virtual Desktop Privileged Access Workstation implementation. It adapts
Microsoft guidance to this repository; it is not a claim of compliance.

## 1. Protect the complete privileged access path

A secure session host is not enough. The user account, client device, AVD
service, session host, administrative tools, network path, and target system all
form one privileged access path. A weaker component can undermine the others.

- Connect from a managed, healthy client device.
- Treat the client device as part of the PAW security boundary.
- Apply Zero Trust: verify explicitly, use least privilege, and assume breach.
- Monitor identities, devices, sessions, and administrative actions.

## 2. Separate privileged work from productivity work

Privileged identities and PAWs should be used only for administrative work.
Email, general web browsing, personal accounts, and productivity activity create
unnecessary phishing and token-theft exposure.

- Give administrators separate named admin and productivity accounts.
- Do not share privileged accounts.
- Limit browsing to approved administrative destinations.
- Keep productivity applications off the PAW unless there is a documented need.
- Use emergency access accounts only through a documented, tested process.

## 3. Require strong, conditional identity assurance

Microsoft Entra ID is the primary identity boundary for this deployment.

- Require MFA or phishing-resistant passwordless authentication for privileged users.
- Apply Conditional Access to both Azure Virtual Desktop and Windows Cloud Login.
- Pilot Token Protection for supported AVD clients and managed devices.
- Use PIM for eligible, time-bound administrative role activation where possible.
- Grant AVD sign-in and Azure roles through reviewed groups, not individual exceptions.
- Review the dynamic `adm_` account naming rule regularly; a name alone is not proof
  that an account should receive privileged access.

## 4. Choose an AVD host model that matches user privilege

Microsoft recommends personal desktops when users require local administrator
rights. A pooled multi-session host is recommended for users with standard
rights in the same trust boundary.

This repository currently deploys one pooled multi-session host. Operational
expectations that users install administrative tools create a design tension:
`TF_VAR_PAW_GROUP` receives VM user login, not VM administrator login, but local
elevation might be granted outside this code.

Before expanding beyond a tightly trusted user set, choose one approach:

- Move to a personal host pool with one assigned host per privileged user; or
- Keep the pooled host, prohibit user elevation, and install approved tools through
  the image or managed software deployment.

Do not grant local administrator rights broadly on a shared multi-session host.

## 5. Deny network access by default

AVD uses reverse connect, so session hosts don't need inbound RDP exposure. The
session host should have no public IP and no route to other networks by default.

- Force outbound traffic through Azure Firewall.
- Allow only documented AVD, Entra, activation, certificate, monitoring, profile,
  and approved administrative endpoints.
- Prefer Microsoft-managed service tags and FQDN tags where supported.
- Validate the allowlist with the AVD Agent URL Tool after every material change.
- Never intercept or redirect Azure platform addresses required by the VM agent.
- Treat every added FQDN, peering, private endpoint, or route as a security change.

The current allowlist is intentionally small. Microsoft doesn't support AVD when
required endpoints are blocked, so availability testing is part of firewall
change approval.

## 6. Build hosts from trusted, immutable images

The image pipeline is the clean source for session hosts.

- Build from a supported Microsoft Windows 11 multi-session image.
- Apply repeatable hardening before generalization.
- Publish immutable Azure Compute Gallery versions.
- Deploy an explicit image version replicated to the PAW region.
- Test a new image before replacing an existing PAW host.
- Retain enough prior versions for rollback and set retirement criteria.
- Never capture user data or credentials into a generalized image.

## 7. Maintain a deliberate patch strategy

Microsoft recommends timely patching and monthly base-image updates. This
runtime intentionally blocks Windows Update, and the Packer Windows Update
provisioner is currently disabled. That combination is only acceptable with an
alternative tested patch process.

Required future operating model:

- Rebuild the golden image at least monthly and for urgent security fixes.
- Enable updates during the controlled image build, or use another approved patch source.
- Scan and test the image before promotion.
- Replace session hosts from the patched image after backing up user data.
- Track Defender intelligence, platform, application, and administrative-tool updates.

## 8. Restore hardware-backed protections

Trusted Launch, Secure Boot, vTPM, boot integrity monitoring, VBS, HVCI, and
Credential Guard reduce bootkit and credential-theft risk.

The current gallery definition isn't marked Trusted Launch compatible, so this
repository explicitly disables Secure Boot and vTPM. This is a security gap, not
a preferred steady state.

Future image definitions should use `TrustedLaunchSupported` or `TrustedLaunch`,
and session hosts should enable Secure Boot, vTPM, and attestation after tool and
driver compatibility testing.

## 9. Allow only approved administrative tools

PAW users need administrative tools, but unrestricted software installation
increases attack surface.

- Prefer tools baked into the image or deployed through a managed catalog.
- Verify publisher signatures and package sources.
- Keep an inventory of installed tools and versions.
- Use App Control for Business or AppLocker, beginning in audit mode.
- Keep Defender Antivirus active; application control is not an antivirus replacement.
- Treat scripts, MSI files, DLLs, and PowerShell as executable content.

## 10. Detect, investigate, and respond

A PAW should produce enough telemetry to investigate privileged activity and
contain compromise.

- Onboard session hosts to Microsoft Defender for Endpoint.
- Enable vulnerability management and EDR.
- Send AVD diagnostics, Azure Activity Logs, Entra sign-in/audit logs, firewall
  logs, and Windows security events to a protected central workspace.
- Alert on risky sign-ins, group changes, role assignments, firewall changes,
  disabled security controls, and boot-integrity failures.
- Test device isolation and privileged-account response procedures.

## 11. Separate user data from replaceable compute

The PAW infrastructure is disposable, but administrative data is not. Users
install tools and retain scripts, keys, configuration, and working data on the
host today.

- Back up and restore-test all required data before VM or resource-group deletion.
- Never interpret VM deallocation as backup.
- Prefer separating profiles and user data from the OS disk.
- Evaluate FSLogix profile containers on Azure Files or Azure NetApp Files.
- If Azure Files is chosen, use a private endpoint, private DNS, encrypted SMB,
  least-privilege share permissions, backup, and explicit firewall rules.
- Define retention, recovery point, recovery time, and restore-test requirements.

Until persistent profiles are implemented, deletion of the VM, OS disk, or PAW
resource group permanently destroys unbacked local data and installed tools.

## 12. Make infrastructure replaceable, not ambiguous

Terraform is the source of truth for resources owned by each folder.

- Keep gallery and PAW deployment state separate.
- Plan before apply.
- Import only resources that match unambiguous configured identities.
- Require empty state for import; don't repair uncertain partial state piecemeal.
- Prefer importing too little over adopting an unrelated online resource.
- If the PAW runtime is broken or ownership is unclear, back up user data, delete
  the complete PAW resource group, import surviving Entra groups, and recreate.
- Remember that deleting local Terraform state does not delete online resources.

The gallery is a longer-lived image source. The PAW runtime resource group is a
replaceable deployment unit.

## 13. Minimize privilege and scope

- Grant users only desktop access and VM sign-in unless elevation is required.
- Generate local break-glass credentials; don't place them in source files.
- Prefer managed identities for workload access.
- Scope role assignments as narrowly as service behavior permits.
- Review service-principal roles required by Start VM on Connect and autoscale.
- Remove stale memberships and role assignments promptly.

Some AVD autoscale guidance calls for subscription-scoped service-principal
permissions, while least privilege favors narrower scope. Validate the selected
scope in the target subscription and document any broader assignment.

## 14. Balance security, availability, and cost consciously

This deployment uses one host, Start VM on Connect, and autoscale to reduce cost.
That creates a single-host availability dependency and slower first connection
when the host is deallocated.

- Never force-logoff active users merely to save cost.
- Distinguish stopped/deallocated from deleted.
- Test Start VM on Connect and autoscale after RBAC or host-pool changes.
- Monitor host registration and agent health.
- Document acceptable startup time and outage tolerance.
- Add capacity or redundancy only after reassessing isolation and data design.

## 15. Control data movement and session redirection

Clipboard, drive, printer, and USB redirection can become exfiltration paths.

- Disable redirection by default.
- Enable only required directions and data types.
- Prefer managed transfer services over local drive mapping.
- Restrict file-system permissions and hide unnecessary drives.
- Avoid direct RDP; use the AVD service path and just-in-time access for exceptional
  troubleshooting.

## Current priorities

1. Design persistent, privately connected profile and user-data storage with tested backup and restore.
2. Decide whether local admin requirements require a personal host pool.
3. Create and validate a monthly image patch and replacement process.
4. Migrate the gallery definition and hosts to Trusted Launch.
5. Add Defender for Endpoint, centralized logs, alerts, and vulnerability management.
6. Add Conditional Access, MFA/passwordless, and a Token Protection pilot.
7. Introduce managed application delivery and application allowlisting.
8. Validate the firewall against Microsoft's complete required endpoint list.

## References

- [Microsoft privileged access devices](https://learn.microsoft.com/en-us/security/privileged-access-workstations/privileged-access-devices)
- [Microsoft enterprise access model](https://learn.microsoft.com/en-us/security/privileged-access-workstations/privileged-access-access-model)
- [Privileged access rapid modernization plan](https://learn.microsoft.com/en-us/security/privileged-access-workstations/security-rapid-modernization-plan)
- [Azure Virtual Desktop security recommendations](https://learn.microsoft.com/en-us/azure/virtual-desktop/security-recommendations)
- [Azure Virtual Desktop network connectivity](https://learn.microsoft.com/en-us/azure/virtual-desktop/network-connectivity)
- [Required Azure Virtual Desktop FQDNs and endpoints](https://learn.microsoft.com/en-us/azure/virtual-desktop/required-fqdn-endpoint)
- [MFA and Conditional Access for Azure Virtual Desktop](https://learn.microsoft.com/en-us/azure/virtual-desktop/set-up-mfa)
- [Microsoft Entra Token Protection](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-token-protection)
- [Azure Virtual Desktop autoscale scaling plans](https://learn.microsoft.com/en-us/azure/virtual-desktop/autoscale-scaling-plan)
- [Start VM on Connect](https://learn.microsoft.com/en-us/azure/virtual-desktop/start-virtual-machine-connect)
- [FSLogix profile containers for Azure Virtual Desktop](https://learn.microsoft.com/en-us/azure/virtual-desktop/fslogix-profile-containers)
- [FSLogix container storage options](https://learn.microsoft.com/en-us/fslogix/concepts-container-storage-options)
- [Azure Files networking and private endpoints](https://learn.microsoft.com/en-us/azure/storage/files/storage-files-networking-overview)
- [Azure Compute Gallery image concepts](https://learn.microsoft.com/en-us/azure/virtual-machines/shared-image-galleries)
- [Trusted Launch for Azure VMs](https://learn.microsoft.com/en-us/azure/virtual-machines/trusted-launch)
- [Azure security baseline for Windows VMs](https://learn.microsoft.com/en-us/azure/virtual-machines/security-recommendations)
- [Application Control for Windows](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/appcontrol)
- [Defender for Endpoint EDR](https://learn.microsoft.com/en-us/defender-endpoint/overview-endpoint-detection-response)
- [Azure VM Backup](https://learn.microsoft.com/en-us/azure/backup/backup-azure-vms-introduction)
