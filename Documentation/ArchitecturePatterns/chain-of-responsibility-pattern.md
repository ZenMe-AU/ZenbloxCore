# Chain-of-Responsibility Pattern

## Overview
### Intent
Apply request/response processing as a sequence of handlers with separated responsibilities.

### Problem
Edge delivery needs independent authentication and header mutation steps without merging concerns into one function.

### Trade-Offs
Handler separation improves clarity and evolution, but increases orchestration points and deployment artifacts.

### Wikipedia Reference
[Chain-of-responsibility pattern](https://en.wikipedia.org/wiki/Chain-of-responsibility_pattern).

## Implementation
CloudFront behavior associates distinct Lambda@Edge functions for viewer-request and viewer-response in [corpSetup/CloudFront/main.tf](../../corpSetup/CloudFront/main.tf#L403) and [corpSetup/CloudFront/main.tf](../../corpSetup/CloudFront/main.tf#L408).

The response handler applies CORS mutations in [corpSetup/CloudFront/source/rewriteHeaderLambdaEdge/index.mjs](../../corpSetup/CloudFront/source/rewriteHeaderLambdaEdge/index.mjs#L8), while the request handler performs token checks in [corpSetup/CloudFront/source/authGuardLambdaEdge/index.mjs](../../corpSetup/CloudFront/source/authGuardLambdaEdge/index.mjs#L121).

## Future enhancements
- Define a handler contract matrix for shared headers and error semantics.
- Add integration tests to assert handler order and composed response behavior.

## Related Decisions and Patterns
- Related decisions:
  - [Edge Authorization Enforcement Point](../Decisions/edge-authorization-enforcement-point.md)
- Related patterns:
  - [OpenID Connect](openid-connect.md)
  - [Adapter Pattern](adapter-pattern.md)
