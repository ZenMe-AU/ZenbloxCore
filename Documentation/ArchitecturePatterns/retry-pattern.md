# Retry Pattern

## Overview
### Intent
Handle transient failures and eventual consistency by retrying bounded operations with controlled intervals.

### Problem
External identity and DNS operations may not be immediately consistent after writes.

### Trade-Offs
Retries improve reliability but can mask structural failures if limits and error conditions are too broad.

### Wikipedia Reference
[Retry pattern](https://en.wikipedia.org/wiki/Retry_pattern).

## Implementation
Domain verification applies retry behavior in [corpSetup/SubscriptionBudget/domain.tf](../../corpSetup/SubscriptionBudget/domain.tf#L75).

AWS SAML metadata readiness is polled using bounded retries and timeout controls in [corpSetup/AwsEntraSso/wait_metadata_ready.mjs](../../corpSetup/AwsEntraSso/wait_metadata_ready.mjs#L93) and [corpSetup/AwsEntraSso/wait_metadata_ready.mjs](../../corpSetup/AwsEntraSso/wait_metadata_ready.mjs#L123).

## Future enhancements
- Add jittered backoff to reduce synchronized retries during parallel operations.
- Expose retry metrics to make transient failures visible in operational reporting.

## Related Decisions and Patterns
- Related decisions:
  - [Edge Authorization Enforcement Point](../Decisions/edge-authorization-enforcement-point.md)
- Related patterns:
  - [Idempotence](idempotence.md)
  - [Adapter Pattern](adapter-pattern.md)
