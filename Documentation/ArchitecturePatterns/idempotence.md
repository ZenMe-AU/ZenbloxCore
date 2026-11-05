# Idempotence

## Overview
### Intent
Ensure repeated deployment runs converge to the same intended state without duplicate side effects.

### Problem
Environments can already contain resources created outside Terraform state, causing collisions on first managed run.

### Trade-Offs
Import-first flows reduce destructive changes but add script complexity and reliance on provider lookups.

### Wikipedia Reference
[Idempotence](https://en.wikipedia.org/wiki/Idempotence).

## Implementation
Stage scripts check for existing resources and import them into state before apply, including [corpSetup/SubscriptionBudget/run.js](../../corpSetup/SubscriptionBudget/run.js#L150), [corpSetup/GlobalGroups/run.js](../../corpSetup/GlobalGroups/run.js#L173), and [corpSetup/RootRg/run.js](../../corpSetup/RootRg/run.js#L179).

The process is also stated as an idempotent behavior in [corpSetup/README.md](../../corpSetup/README.md#L108).

## Future enhancements
- Capture import operations in a structured log for audit and troubleshooting.
- Add dry-run reconciliation output that reports expected imports before execution.

## Related Decisions and Patterns
- Related decisions:
  - [Stage Numbering and Rollout Order](../Decisions/stage-numbering-and-rollout-order.md)
- Related patterns:
  - [Pipeline (software)](pipeline-software.md)
  - [Template Method Pattern](template-method-pattern.md)
  - [Retry Pattern](retry-pattern.md)
