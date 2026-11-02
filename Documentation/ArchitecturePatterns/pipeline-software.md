# Pipeline (software)

## Overview
### Intent
Execute infrastructure provisioning in ordered stages with explicit progression gates.

### Problem
Environment bootstrap requires deterministic ordering across subscription, identity, resource groups, and edge deployment.

### Trade-Offs
Strong ordering improves reliability but reduces ad hoc parallelism and can increase overall runtime.

### Wikipedia Reference
[Pipeline (software)](https://en.wikipedia.org/wiki/Pipeline_(software)).

## Implementation
Each stage is dispatched by its folder name: the plan action validates the name and runs that folder's run.js in [.github/actions/plan-and-publish/action.yml](../../.github/actions/plan-and-publish/action.yml#L37), which ends by planning or applying in its own folder, for example [corpSetup/RootRg/run.js](../../corpSetup/RootRg/run.js#L373).

The operational runbook mirrors this sequence, documenting the cXX progression from bootstrap to cloudfront delivery in [Documentation/README.md](../README.md).

## Future enhancements
- Add dependency metadata per stage to make ordering constraints explicit in machine-readable form.
- Add partial rerun orchestration with automatic downstream impact warnings.

## Related Decisions and Patterns
- Related decisions:
  - [Stage Numbering and Rollout Order](../Decisions/stage-numbering-and-rollout-order.md)
- Related patterns:
  - [Template Method Pattern](template-method-pattern.md)
  - [Idempotence](idempotence.md)
  - [Externalized Configuration](externalized-configuration.md)
