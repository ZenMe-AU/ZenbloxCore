# Template Method Pattern

## Overview
### Intent
Reuse a common orchestration skeleton while allowing stage-specific preflight and import behavior.

### Problem
Each deployment stage follows similar lifecycle operations but needs different preparation logic.

### Trade-Offs
Shared flow improves consistency, but script inheritance-by-convention can hide stage differences if not documented.

### Wikipedia Reference
[Template method pattern](https://en.wikipedia.org/wiki/Template_method_pattern).

## Implementation
The shared lifecycle is implemented in [corpSetup/initCorpEnvDeploy.js](../../corpSetup/initCorpEnvDeploy.js#L155), with per-stage functions handling custom prechecks and imports, for example [corpSetup/c05rootrg/run.js](../../corpSetup/c05rootrg/run.js#L159) and [corpSetup/c25cloudfront/run.js](../../corpSetup/c25cloudfront/run.js#L184).

Each stage script plugs into the common runner and contributes stage-specific logic before Terraform execution.

## Future enhancements
- Standardize stage hook contracts with explicit input and output schemas.
- Add validation tests that assert required preflight hooks exist for each stage.

## Related Decisions and Patterns
- Related decisions:
  - [Stage Numbering and Rollout Order](../Decisions/stage-numbering-and-rollout-order.md)
- Related patterns:
  - [Pipeline (software)](pipeline-software.md)
  - [Idempotence](idempotence.md)
