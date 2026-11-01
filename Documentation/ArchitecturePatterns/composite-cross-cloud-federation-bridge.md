# Composite Pattern: Cross-Cloud Federation Bridge

## Overview
### Intent
Deliver federated access from Microsoft Entra into AWS by composing identity claims, metadata propagation, and provider-specific integration.

### Problem
Federation setup spans different identity and policy models across Azure and AWS.

### Trade-Offs
The bridge enables centralized identity with cloud-local authorization targets, but introduces synchronization and claim contract dependencies.

## Implementation
The Entra enterprise app bootstrap and integration scaffolding begin in [corpSetup/AwsEntraSso/main.tf](../../corpSetup/AwsEntraSso/main.tf#L9).

SAML metadata readiness is stabilized through retry handling in [corpSetup/AwsEntraSso/wait_metadata_ready.mjs](../../corpSetup/AwsEntraSso/wait_metadata_ready.mjs#L93).

AWS-side role and claim policy wiring is implemented in [corpSetup/AwsEntraSsoP2/main.tf](../../corpSetup/AwsEntraSsoP2/main.tf#L26) and [corpSetup/AwsEntraSsoP2/policy.tf](../../corpSetup/AwsEntraSsoP2/policy.tf#L154).

## Future enhancements
- Add end-to-end federation smoke tests that validate role resolution per group.
- Add explicit monitoring on metadata drift and federation endpoint health.

## Related Decisions and Patterns
- Related decisions:
  - [Identity Provider Microsoft Entra](../Decisions/identity-provider-microsoft-entra.md)
  - [Cross-Cloud DNS and Certificate Governance](../Decisions/cross-cloud-dns-and-certificate-governance.md)
- Related patterns:
  - [Claims-Based Identity](claims-based-identity.md)
  - [Adapter Pattern](adapter-pattern.md)
  - [Retry Pattern](retry-pattern.md)
