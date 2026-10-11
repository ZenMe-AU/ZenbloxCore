# Privileged Access Management

## Overview
### Intent
Privileged access is least-privilege, dedicated, MFA-protected, logged, and physically/virtually separated from normal user work through a PAW/Secure Admin Workstation model.

### Problem
- Privileged accounts are accounts that can alter or bypass system controls.
- Access is validated on request, limited to only what is required for the role, and used through dedicated privileged accounts rather than shared or everyday accounts.
- Privileged access is unique per admin task or server app where appropriate.
- Privileged users are generally prevented from internet, email, and web access unless explicitly approved and tightly bounded.
- Privileged access and privileged account changes are centrally logged, including security group and account management events.
- MFA is enabled for privileged users.
- Privileged access remains a separate trust boundary from normal user access.

- PAW / Secure Admin Workstation guidance:
  - Administrative work occurs in a separate privileged environment.
  - A Secure Admin Workstation / PAW is used for administrative activities.
  - Privileged and unprivileged operating environments are separated.
  - Unprivileged users cannot log on to privileged environments.
  - Privileged users cannot log on to unprivileged environments.
  - Privileged operating environments are not virtualised inside unprivileged environments.

### Trade-Offs

### Wikipedia Reference

- [Privileged access management](https://en.wikipedia.org/wiki/Privileged_access_management)
- [Privileged access workstation](https://en.wikipedia.org/wiki/Privileged_access_workstation)
- [Principle of least privilege](https://en.wikipedia.org/wiki/Principle_of_least_privilege)
- [Privilege escalation](https://en.wikipedia.org/wiki/Privilege_escalation)
- [Multi-factor authentication](https://en.wikipedia.org/wiki/Multi-factor_authentication)
- [Just-in-time access](https://en.wikipedia.org/wiki/Just-in-time_access)
- [Administrative account](https://en.wikipedia.org/wiki/Administrative_account)
- [Privileged account](https://en.wikipedia.org/wiki/Privileged_account)
- [Security group](https://en.wikipedia.org/wiki/Access_control_list#Group-based_access_control)
- [Security boundary](https://en.wikipedia.org/wiki/Security_boundary)
- [Trusted computing base](https://en.wikipedia.org/wiki/Trusted_computing_base)

### ISM Reference

- ism-1507 — Validate requests for privileged access.
- ism-1508 — Limit privileged access to only what is required for the role.
- ism-1175 — Prevent privileged users from internet, email, and web access unless explicitly approved.
- ism-1883 — Restrict approved online access for privileged users to only required activities.
- ism-0445 — Use dedicated privileged accounts for privileged users.
- ism-1263 — Use unique privileged accounts for individual server applications.
- ism-1649 — Use just-in-time administration for system administration.
- ism-1173 — Use multi-factor authentication for privileged users.
- ism-1509 — Centrally log privileged access events.
- ism-1650 — Centrally log privileged account and security group management events.
- ism-1898 — Use Secure Admin Workstations for administrative activities.
- ism-1380 — Separate privileged and unprivileged operating environments.
- ism-1687 — Do not virtualise privileged environments inside unprivileged environments.
- ism-1688 — Prevent unprivileged users from logging on to privileged environments.
- ism-1689 — Prevent privileged users from logging on to unprivileged environments.

