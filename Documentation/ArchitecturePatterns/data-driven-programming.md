# Data-Driven Programming

## Overview
### Intent
Generate identity resources from declarative tabular inputs instead of hardcoded per-user logic.

### Problem
User and group onboarding must scale while staying consistent and auditable.

### Trade-Offs
Input-driven provisioning is flexible, but malformed data can propagate quickly without strict validation.

### Wikipedia Reference
[Data-driven programming](https://en.wikipedia.org/wiki/Data-driven_programming).

## Implementation
User and group records are parsed and transformed from CSV into Terraform maps in [corpSetup/UserAccounts/main.tf](../../corpSetup/UserAccounts/main.tf#L36) and [corpSetup/UserAccounts/main.tf](../../corpSetup/UserAccounts/main.tf#L123).

Provisioning and relationship assignment then materialize resources from these structures in [corpSetup/UserAccounts/main.tf](../../corpSetup/UserAccounts/main.tf#L162).

## Future enhancements
- Add explicit schema validation and duplicate detection before plan/apply.
- Add preview reports that summarize user and group deltas per run.

## Related Decisions and Patterns
- Related decisions:
  - [Token in Cookie Edge Auth Tradeoff](../Decisions/token-in-cookie-edge-auth-tradeoff.md)
- Related patterns:
  - [Idempotence](idempotence.md)
  - [Externalized Configuration](externalized-configuration.md)
