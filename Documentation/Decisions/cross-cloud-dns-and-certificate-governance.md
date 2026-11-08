# Decision: Cross-Cloud DNS and Certificate Governance

## Status
Accepted

## Context
Delivery runs on AWS CloudFront while DNS governance remains in Azure DNS.

## Decision
Keep Azure DNS authoritative and use it for AWS ACM certificate validation and CloudFront alias routing.

## Rationale
This preserves existing DNS governance while enabling AWS edge delivery.

## Consequences
- Positive: maintains centralized DNS control in Azure while supporting AWS delivery.
- Negative: introduces cross-provider operational coupling and troubleshooting complexity.

## Evidence
- [corpSetup/CloudFront/main.tf](../../corpSetup/CloudFront/main.tf#L227)
- [corpSetup/CloudFront/main.tf](../../corpSetup/CloudFront/main.tf#L742)

## Related Patterns
- [Adapter Pattern](../ArchitecturePatterns/adapter-pattern.md)
- [Composite Pattern: Cross-Cloud Federation Bridge](../ArchitecturePatterns/composite-cross-cloud-federation-bridge.md)
