# Decision: Stage Numbering and Rollout Order

## Status
Superseded. Stages are no longer numbered and there is no deploy orchestrator: the order is the stage list in the UI pipeline, and each stage runs on its own from its folder's run.js.

## Context
Infrastructure bootstrap spans multiple domains that depend on outputs from earlier stages.

## Decision
Use numbered cXX stages and a fixed progression controlled by the deploy orchestrator.

## Rationale
Ordered execution reduces dependency ambiguity and supports predictable failure isolation.

## Consequences
- Positive: easier traceability and repeatability across environments.
- Negative: less flexibility for ad hoc parallel execution.

## Evidence
- [zeninstallerPvt/ui/corp-src/logic/pipeline.ts](../../zeninstallerPvt/ui/corp-src/logic/pipeline.ts#L20)

## Related Patterns
- [Pipeline (software)](../ArchitecturePatterns/pipeline-software.md)
- [Template Method Pattern](../ArchitecturePatterns/template-method-pattern.md)
