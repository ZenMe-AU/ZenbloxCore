# Decision: Token in Cookie Edge Auth Tradeoff

## Status
Accepted

## Context
The login flow must hand identity state to edge authorization checks across related subdomains.

## Decision
Use cookie-carried id token for edge validation in the current implementation.

## Rationale
The approach simplifies login handoff and immediate edge access checks with existing components.

## Consequences
- Positive: straightforward integration between popup login flow and edge guard.
- Negative: security tradeoff versus stronger session-only or HttpOnly patterns depending on threat model.

## Evidence
- [corpSetup/CloudFront/source/loginApp/src/hooks/useAuth.ts](../../corpSetup/CloudFront/source/loginApp/src/hooks/useAuth.ts#L36)
- [corpSetup/CloudFront/source/authGuardLambdaEdge/index.mjs](../../corpSetup/CloudFront/source/authGuardLambdaEdge/index.mjs#L31)

## Related Patterns
- [OpenID Connect](../ArchitecturePatterns/openid-connect.md)
- [Composite Pattern: Popup Auth Bootstrap](../ArchitecturePatterns/composite-popup-auth-bootstrap.md)
