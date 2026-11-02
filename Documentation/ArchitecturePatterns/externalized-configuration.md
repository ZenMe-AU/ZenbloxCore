# Externalized Configuration

## Overview
### Intent
Keep deploy-time and runtime configuration outside application code and inject values during orchestration.

### Problem
Multi-stage and cross-cloud workflows need environment-specific values without hardcoding secrets or tenant-specific identifiers.

### Trade-Offs
Externalized config improves portability but increases dependency on template consistency and variable validation.

### Wikipedia Reference
[Configuration management](https://en.wikipedia.org/wiki/Configuration_management).

## Implementation
Each stage reads and validates corp-level environment variables from corp.env, for example [corpSetup/RootRg/run.js](../../corpSetup/RootRg/run.js#L126), and the subscription stage persists its output for downstream steps at [corpSetup/SubscriptionBudget/run.js](../../corpSetup/SubscriptionBudget/run.js#L191).

Terraform environment injection is handled in [corpSetup/tfUtils.js](../../corpSetup/tfUtils.js). Edge and login runtime configuration are rendered from templates in [corpSetup/CloudFront/main.tf](../../corpSetup/CloudFront/main.tf#L30), [corpSetup/CloudFront/source/loginApp/template/config.js.tpl](../../corpSetup/CloudFront/source/loginApp/template/config.js.tpl#L1), and [corpSetup/CloudFront/source/authGuardLambdaEdge/template/config.js.tpl](../../corpSetup/CloudFront/source/authGuardLambdaEdge/template/config.js.tpl#L1).

## Future enhancements
- Add schema validation for generated config artifacts before packaging.
- Separate sensitive and non-sensitive configuration channels to reduce accidental exposure.

## Related Decisions and Patterns
- Related decisions:
  - [Cross-Cloud DNS and Certificate Governance](../Decisions/cross-cloud-dns-and-certificate-governance.md)
- Related patterns:
  - [Pipeline (software)](pipeline-software.md)
  - [OpenID Connect](openid-connect.md)
