# Privileged Access Management

Privileged access should be least-privilege, dedicated, MFA-protected, logged, and physically/virtually separated from normal user work through a PAW/Secure Admin Workstation model.

Privileged accounts are accounts that can alter or bypass system controls; they are often targeted by attackers.
Access must be:
validated on request,
limited to only what is required for the role,
used via dedicated privileged accounts instead of shared or everyday accounts,
unique per admin task or server app where appropriate.
Privileged users should generally be prevented from internet, email, and web access unless explicitly approved and tightly bounded.
Privileged access and privileged account changes must be centrally logged, including security group and account management events.
MFA is expected for privileged users.
Privileged access is not to be “just normal user access with extra rights”; it is treated as a separate trust boundary.

PAW / Secure Admin Workstation guidance
admin work should happen in a separate privileged environment
use a Secure Admin Workstation / PAW for administrative activities,
separate privileged and unprivileged operating environments,
unprivileged users cannot log onto privileged environments,
privileged users cannot log onto unprivileged environments,
privileged operating environments should not be virtualized inside unprivileged environments.

