# Claims-Based Identity

## Overview
### Intent
Grant access based on identity claims mapped to application roles and federation contracts.

### Problem
AWS role access must be derived from Entra identities with predictable claim semantics.

### Trade-Offs
Claims mapping centralizes authorization logic but requires careful claim contract governance across providers.

### Wikipedia Reference
[Claims-based identity](https://en.wikipedia.org/wiki/Claims-based_identity).

## Implementation
Entra group-to-app-role assignments are provisioned in [corpSetup/AwsEntraSsoP2/group.tf](../../corpSetup/AwsEntraSsoP2/group.tf#L9).

Custom SAML claims policy and role assertion transformations are defined in [corpSetup/AwsEntraSsoP2/policy.tf](../../corpSetup/AwsEntraSsoP2/policy.tf#L154) and [corpSetup/AwsEntraSsoP2/policy.tf](../../corpSetup/AwsEntraSsoP2/policy.tf#L168).

## Future enhancements
- Add contract tests that validate expected claim output against representative users/groups.
- Track policy versioning and rollout impact across relying parties.

## Related Decisions and Patterns
- Related decisions:
  - [Identity Provider Microsoft Entra](../Decisions/identity-provider-microsoft-entra.md)
- Related patterns:
  - [OpenID Connect](openid-connect.md)
  - [Adapter Pattern](adapter-pattern.md)
