# Composite Pattern: Progressive Platform Bootstrap

## Overview
### Intent
Bootstrap an environment progressively from foundational subscription setup through delivery layers using staged orchestration.

### Problem
Multi-domain infrastructure dependencies require controlled sequencing and state handoff across stages.

### Trade-Offs
Progressive rollout reduces blast radius and improves diagnosability, but increases orchestration complexity and lead time.

## Implementation
Each stage runs on its own from its folder's run.js, ending in the same plan-or-apply step, for example [corpSetup/RootRg/run.js](../../corpSetup/RootRg/run.js#L373).

Idempotent imports and state adoption in foundational stages are handled in [corpSetup/GlobalGroups/run.js](../../corpSetup/GlobalGroups/run.js#L173) and [corpSetup/RootRg/run.js](../../corpSetup/RootRg/run.js#L179).

Cross-stage environment output propagation is persisted through [corpSetup/SubscriptionBudget/run.js](../../corpSetup/SubscriptionBudget/run.js#L191).

## Future enhancements
- Define explicit stage contracts with required inputs and produced outputs.
- Add resumable checkpoints per stage to reduce rerun cost after failures.

## Related Decisions and Patterns
- Related decisions:
  - [Stage Numbering and Rollout Order](../Decisions/stage-numbering-and-rollout-order.md)
- Related patterns:
  - [Pipeline (software)](pipeline-software.md)
  - [Template Method Pattern](template-method-pattern.md)
  - [Idempotence](idempotence.md)
  - [Externalized Configuration](externalized-configuration.md)
