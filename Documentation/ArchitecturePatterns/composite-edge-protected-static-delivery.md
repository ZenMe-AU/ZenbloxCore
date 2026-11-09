# Composite Pattern: Edge-Protected Static Delivery

## Overview
### Intent
Protect static content delivery by enforcing identity checks and policy controls at the edge before origin access.

### Problem
Static hosting alone does not provide centralized access control and response policy guarantees.

### Trade-Offs
Edge security controls reduce origin exposure, but can complicate caching and debugging behavior across request phases.

## Implementation
CloudFront distribution behaviors bind edge request and response handlers in [corpSetup/CloudFront/main.tf](../../corpSetup/CloudFront/main.tf#L682) and [corpSetup/CloudFront/main.tf](../../corpSetup/CloudFront/main.tf#L687).

The request handler validates identity tokens in [corpSetup/CloudFront/source/authGuardLambdaEdge/index.mjs](../../corpSetup/CloudFront/source/authGuardLambdaEdge/index.mjs#L121), while response hardening and header policy controls are set in [corpSetup/CloudFront/main.tf](../../corpSetup/CloudFront/main.tf#L779).

Origin access is constrained through CloudFront-signed access in [corpSetup/CloudFront/main.tf](../../corpSetup/CloudFront/main.tf#L585).

## Future enhancements
- Add structured edge decision logs for allow/deny outcomes.
- Add distribution-level regression tests for cache and auth interactions.

## Related Decisions and Patterns
- Related decisions:
  - [Edge Authorization Enforcement Point](../Decisions/edge-authorization-enforcement-point.md)
  - [Token in Cookie Edge Auth Tradeoff](../Decisions/token-in-cookie-edge-auth-tradeoff.md)
- Related patterns:
  - [OpenID Connect](openid-connect.md)
  - [Chain-of-Responsibility Pattern](chain-of-responsibility-pattern.md)
  - [Adapter Pattern](adapter-pattern.md)
