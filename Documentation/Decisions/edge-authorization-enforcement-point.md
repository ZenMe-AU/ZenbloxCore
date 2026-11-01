# Decision: Edge Authorization Enforcement Point

## Status
Accepted

## Context
Static origin hosting needs centralized access control before content retrieval.

## Decision
Enforce authentication and access checks at CloudFront viewer-request stage.

## Rationale
Edge enforcement blocks unauthorized access before origin fetch and centralizes policy behavior.

## Consequences
- Positive: reduces origin exposure and unifies entry policy enforcement.
- Negative: edge debugging complexity and stricter reliance on token/cookie handling.

## Evidence
- [corpSetup/CloudFront/main.tf](../../corpSetup/CloudFront/main.tf#L403)
- [corpSetup/CloudFront/source/authGuardLambdaEdge/index.mjs](../../corpSetup/CloudFront/source/authGuardLambdaEdge/index.mjs#L121)

## Related Patterns
- [Chain-of-Responsibility Pattern](../ArchitecturePatterns/chain-of-responsibility-pattern.md)
- [OpenID Connect](../ArchitecturePatterns/openid-connect.md)
