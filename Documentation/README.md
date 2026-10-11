# Zenblox Core Repository



# Architecture Patterns

This index lists all documented patterns and composite patterns used in this repository. Each entry has a short summary and links to a dedicated file with implementation details.

## Enterprise patterns

- [Privileged access management](./ArchitecturePatterns/privileged-access-management.md): Privileged access management design and controls used across enterprise environments.

## Programming Patterns

- [Pipeline (software)](./ArchitecturePatterns/pipeline-software.md): Documents the stage-based deployment flow that executes infrastructure bootstrap in a deterministic cXX sequence.
- [Template Method Pattern](./ArchitecturePatterns/template-method-pattern.md): Captures the shared orchestration skeleton in deployment scripts, with stage-specific hook behavior.
- [Idempotence](./ArchitecturePatterns/idempotence.md): Describes import-first reconcile behavior that safely adopts existing resources before managed updates.
- [Externalized Configuration](./ArchitecturePatterns/externalized-configuration.md): Covers environment and template-driven configuration handoff between scripts, Terraform, and edge components.
- [Retry Pattern](./ArchitecturePatterns/retry-pattern.md): Describes bounded retry loops used to handle eventual consistency and transient provider readiness issues.
- [Data-Driven Programming](./ArchitecturePatterns/data-driven-programming.md): Captures CSV-driven identity provisioning logic that derives resources from tabular input.
- [Claims-Based Identity](./ArchitecturePatterns/claims-based-identity.md): Describes SAML claim shaping and role mapping across Entra and AWS integration.
- [Adapter Pattern](./ArchitecturePatterns/adapter-pattern.md): Documents cross-provider choreography where Azure DNS and identity artifacts are adapted into AWS delivery workflows.
- [Chain-of-Responsibility Pattern](./ArchitecturePatterns/chain-of-responsibility-pattern.md): Describes split edge handlers where request and response logic are applied in sequence.
- [OpenID Connect](./ArchitecturePatterns/openid-connect.md): Documents edge JWT verification and login flow integration based on Microsoft Entra OpenID Connect metadata.

## Composite Patterns

- [Progressive Platform Bootstrap](./ArchitecturePatterns/composite-progressive-platform-bootstrap.md): Combines pipeline orchestration, idempotent reconcile, and externalized configuration into staged environment bootstrap.
- [Cross-Cloud Federation Bridge](./ArchitecturePatterns/composite-cross-cloud-federation-bridge.md): Combines claims-based identity, retry handling, and cross-provider adaptation to deliver Entra to AWS federation.
- [Edge-Protected Static Delivery](./ArchitecturePatterns/composite-edge-protected-static-delivery.md): Combines edge auth, chained handlers, and secure origin delivery to protect static web assets.
- [Popup Auth Bootstrap](./ArchitecturePatterns/composite-popup-auth-bootstrap.md): Combines popup login mediation, OIDC token acquisition, and edge revalidation for interactive authentication handoff.

## Related Decisions

- Non-pattern architecture decisions are documented in [Documentation/Decisions/README.md](./Decisions/README.md).
