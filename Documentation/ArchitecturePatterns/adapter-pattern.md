# Adapter Pattern

## Overview
### Intent
Bridge incompatible interfaces between providers so one workflow can span cloud boundaries.

### Problem
Certificate issuance and DNS validation workflows require orchestration across AWS ACM and Azure DNS semantics.

### Trade-Offs
Adapter-style integration enables hybrid operation but increases coupling to both provider API behaviors.

### Wikipedia Reference
[Adapter pattern](https://en.wikipedia.org/wiki/Adapter_pattern).

## Implementation
Certificate requests are created in AWS and validated by DNS records managed in Azure in [corpSetup/CloudFront/main.tf](../../corpSetup/CloudFront/main.tf#L215), [corpSetup/CloudFront/main.tf](../../corpSetup/CloudFront/main.tf#L227), and [corpSetup/CloudFront/main.tf](../../corpSetup/CloudFront/main.tf#L247).

Azure DNS aliases then route traffic to CloudFront endpoints in [corpSetup/CloudFront/main.tf](../../corpSetup/CloudFront/main.tf#L742).

## Future enhancements
- Isolate provider-specific logic behind module interfaces to reduce direct coupling.
- Add integration checks that verify DNS and certificate state before CloudFront updates.

## Related Decisions and Patterns
- Related decisions:
  - [Cross-Cloud DNS and Certificate Governance](../Decisions/cross-cloud-dns-and-certificate-governance.md)
- Related patterns:
  - [Retry Pattern](retry-pattern.md)
  - [Claims-Based Identity](claims-based-identity.md)
