# Composite Pattern: Popup Auth Bootstrap

## Overview
### Intent
Use an isolated login application and browser messaging flow to bootstrap authentication in an edge-guarded experience.

### Problem
The protected edge route needs a user-friendly login initiation and completion mechanism without exposing origin internals.

### Trade-Offs
Popup mediation decouples login UI from guarded routes, but can be sensitive to browser popup policies and cross-window coordination.

## Implementation
The edge login page template opens and coordinates a popup flow in [corpSetup/CloudFront/source/authGuardLambdaEdge/template/login.html.tpl](../../corpSetup/CloudFront/source/authGuardLambdaEdge/template/login.html.tpl#L108).

The login SPA enforces auth and token retrieval in [corpSetup/CloudFront/source/loginApp/src/pages/LoginGuard.tsx](../../corpSetup/CloudFront/source/loginApp/src/pages/LoginGuard.tsx#L19) and [corpSetup/CloudFront/source/loginApp/src/hooks/useAuth.ts](../../corpSetup/CloudFront/source/loginApp/src/hooks/useAuth.ts#L24).

The handoff completes through postMessage status signaling and cookie availability for the next edge check in [corpSetup/CloudFront/source/loginApp/src/hooks/useAuth.ts](../../corpSetup/CloudFront/source/loginApp/src/hooks/useAuth.ts#L57).

## Future enhancements
- Add explicit fallback UX for popup-blocked scenarios.
- Add handshake integrity checks for opener lifecycle edge cases.

## Related Decisions and Patterns
- Related decisions:
  - [Identity Provider Microsoft Entra](../Decisions/identity-provider-microsoft-entra.md)
  - [Token in Cookie Edge Auth Tradeoff](../Decisions/token-in-cookie-edge-auth-tradeoff.md)
- Related patterns:
  - [OpenID Connect](openid-connect.md)
  - [Chain-of-Responsibility Pattern](chain-of-responsibility-pattern.md)
  - [Externalized Configuration](externalized-configuration.md)
