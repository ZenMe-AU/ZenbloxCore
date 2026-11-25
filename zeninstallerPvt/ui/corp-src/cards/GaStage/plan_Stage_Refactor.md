# Remaining Stage Card Refactor Plan

## Goal

Refactor the stage cards incrementally while preserving a directly comparable legacy implementation.

The new implementation will intentionally be independent from the old card. Compatibility links should be temporary and explicitly marked. The final target is explicit, statically typed stage cards rather than dynamically generated stage instances.


## Phase 1

### 1.1 Source-mapped investigation — complete

`GaStage` is not one mutually exclusive lifecycle enum. It composes the server's `Stage` report, a local per-stage `StageRun`, derived guards/presentation, and child/local UI state. Keep this model internal; do not map it to the card shell or BaseCard lifecycle.

| Concern | Current source and transitions | Phase 1.2 treatment |
|---|---|---|
| Server report and card status | Reports are merged into `Stage` in [useDeploymentPlan.ts](./useDeploymentPlan.ts#L134-L199); the status fields are defined in [types.ts](../../types.ts#L303-L322). Effective status and the `CardStatus` projection are in [stage.ts](../../logic/stage.ts#L68-L77) and [stage.ts](../../logic/stage.ts#L125-L158). | Keep report state authoritative. Do not copy `pending/success/failed/skipped/deployed` into a second local lifecycle. A failed/cancelled apply can leave its successful plan available; `"cancelled"` is already in `DeployStatus`. |
| Per-card operation | `StageRun` and the run map are in [useDeploymentPlan.ts](./useDeploymentPlan.ts#L18-L23) and [useDeploymentPlan.ts](./useDeploymentPlan.ts#L72-L93). It starts before plan dispatch in [useDeploymentPlan.ts](./useDeploymentPlan.ts#L233-L262); polling retries stale reports and clears the run on a newer report in [useDeploymentPlan.ts](./useDeploymentPlan.ts#L105-L162). Errors are set on trigger/report failure there and at [useDeploymentPlan.ts](./useDeploymentPlan.ts#L201-L207). Environment changes clear runs at [useDeploymentPlan.ts](./useDeploymentPlan.ts#L216-L225). | This is the state machine to make explicit: `idle` (no run entry), `active` (`run` exists with no error; `kind` is plan/deploy), and `error` (run entry has an error). Keep countdown/retry metadata in the active state. A newer report returns it to idle. |
| Operation-to-view mapping | `isStale` actually means “run active” (`run != null && run.error == null`), and feeds status/controls in [createGaStageCardModel.ts](./createGaStageCardModel.ts#L66-L110) and [createGaStageCardModel.ts](./createGaStageCardModel.ts#L132-L138). | Treat `isStale` as a derived active-run selector, not another state. Preserve the existing per-kind action guards: plan run errors allow refresh again, while deploy run errors currently suppress `trackDeploy`. |
| Prerequisite gate | Missing/incomplete/changed values are computed in [stage.ts](../../logic/stage.ts#L90-L117), passed into the card model in [createGaStageCardModel.ts](./createGaStageCardModel.ts#L71-L76), and hide the Plan region at [GaStage.tsx](./GaStage.tsx#L558-L562) and [GaStage.tsx](./GaStage.tsx#L652-L653). | Keep this as a live guard with its reason, not as a competing workflow state. Repository lock and permission/provider checks also remain guards. |
| Plan details and local UI | The request-keyed plan result is in [GaStage.tsx](./GaStage.tsx#L470-L479), fetched into loading/data/error outcomes at [GaStage.tsx](./GaStage.tsx#L519-L537), and rendered at [GaStage.tsx](./GaStage.tsx#L562-L562) and [GaStage.tsx](./GaStage.tsx#L693-L708). Disclosure and variable-editor state are local at [GaStage.tsx](./GaStage.tsx#L122-L128) and [GaStage.tsx](./GaStage.tsx#L468-L479). | Leave request results, form editing, and disclosure state in their existing owners; they are not operation states. |
| Deploy and terminal | The deploy button checks access, starts the remote terminal, then begins report polling in [GaStage.tsx](./GaStage.tsx#L499-L512); `deployStage` only watches the report in [useDeploymentPlan.ts](./useDeploymentPlan.ts#L264-L280). The terminal already has its own statuses in [remoteTerminal.ts](../../logic/remoteTerminal.ts#L41-L41) and transitions in [useRemoteTerminal.ts](./useRemoteTerminal.ts#L152-L193) and [useRemoteTerminal.ts](./useRemoteTerminal.ts#L198-L321). Deploy outcomes render from the report at [GaStage.tsx](./GaStage.tsx#L765-L790). | Do not model terminal startup as the deploy poll state or duplicate its FSM. Keep deploy-report outcome separate from the operation monitor. |

### 1.2 Implement the internal operation state model

Replace the nullable-error `StageRun` shape with a typed `idle | active | error` state, retaining `kind`, countdown, retry count, and message where applicable. Keep `Stage` reports, prerequisite guards, plan-detail fetches, and the terminal session as their existing sources of truth. Test plan trigger failure/retry, stale-report retry and timeout, newer-report completion, environment reset, and deploy polling after terminal start. Preserve the current plan-versus-deploy error action guards unless intentionally changed.

### 1.3 Re-evaluate against BaseCard

Only after the internal model is implemented, investigate how its states should map to the BaseCard lifecycle and whether any states should be merged.


## Future work not in current scope

These are intentionally left on the roadmap.

- `StageCard.tsx` currently creates one remote-terminal hook/session but renders `RemoteTerminal` in two locations, this should be investigated and fixed when ready.
- split shared UI into explicit panels;
- move server state to TanStack Query;
- replace legacy `CardChrome` with `BaseCard`;
- register cards and typed outputs in AppContext;
- move shared behavior into `GaStage`;
- move stage-specific behavior into the concrete cards;
- remove the legacy StageCard implementation;
- remove obsolete dynamic helpers and compatibility code.