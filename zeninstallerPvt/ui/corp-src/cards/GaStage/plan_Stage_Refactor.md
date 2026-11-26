# Remaining Stage Card Refactor Plan

## Goal

Refactor the stage cards incrementally while preserving a directly comparable legacy implementation.

The new implementation will intentionally be independent from the old card. Compatibility links should be temporary and explicitly marked. The final target is explicit, statically typed stage cards rather than dynamically generated stage instances.


## Phase 1

### 1.1 Source-mapped investigation — complete

`GaStage` is not one mutually exclusive lifecycle enum. It composes the server's `Stage` report, a local per-stage `StageRun`, derived guards/presentation, and child/local UI state. Keep this model internal; do not map it to the card shell or BaseCard lifecycle.

| Concern | Current source and transitions | Phase 1.2 treatment |
|---|---|---|
| Server report and card status | Reports are merged into `Stage` in [useDeploymentPlan.ts](./useDeploymentPlan.ts#L166-L231); the status fields are defined in [types.ts](../../types.ts#L303-L322). Effective status and the `CardStatus` projection are in [stage.ts](../../logic/stage.ts#L68-L77) and [stage.ts](../../logic/stage.ts#L125-L158). | Keep report state authoritative. A failed/cancelled apply can leave its successful plan available; `"cancelled"` is already in `DeployStatus`. |
| Per-card operation | The typed states and run map are in [useDeploymentPlan.ts](./useDeploymentPlan.ts#L21-L24) and [useDeploymentPlan.ts](./useDeploymentPlan.ts#L80-L115). Plan dispatch begins at [useDeploymentPlan.ts](./useDeploymentPlan.ts#L273-L310); polling and report transitions are at [useDeploymentPlan.ts](./useDeploymentPlan.ts#L136-L198). Environment changes clear runs at [useDeploymentPlan.ts](./useDeploymentPlan.ts#L252-L265). | `idle` has no run entry; `active` tracks plan/deploy with countdown and retries; `error` retains kind and message. A newer report returns the operation to idle. |
| Operation-to-view mapping | `isStale` means “run active” and feeds status/controls in [createGaStageCardModel.ts](./createGaStageCardModel.ts#L78-L116) and [createGaStageCardModel.ts](./createGaStageCardModel.ts#L138-L148). | `isStale` is derived, not another state. Existing actions retain their guards; the transition buttons bypass them. |
| Prerequisite gate | Missing/incomplete/changed values are computed in [stage.ts](../../logic/stage.ts#L90-L117), passed into the card model in [createGaStageCardModel.ts](./createGaStageCardModel.ts#L71-L82), and hide the Plan region at [GaStage.tsx](./GaStage.tsx#L571-L575) and [GaStage.tsx](./GaStage.tsx#L681-L682). | Assessments and their reasons remain separate from operation state. The new transition buttons bypass existing repository, prerequisite, and permission/provider guards; whether guards are needed will be evaluated later. |
| Plan details and local UI | The request-keyed plan result is in [GaStage.tsx](./GaStage.tsx#L479-L490), fetched at [GaStage.tsx](./GaStage.tsx#L531-L548), and rendered at [GaStage.tsx](./GaStage.tsx#L722-L737). Disclosure and variable-editor state are local at [GaStage.tsx](./GaStage.tsx#L123-L129) and [GaStage.tsx](./GaStage.tsx#L479-L490). | Request results, form editing, and disclosure state remain in their existing owners. |
| Deploy and terminal | The normal deploy action checks access and starts the terminal in [GaStage.tsx](./GaStage.tsx#L510-L524); operation tracking surrounds terminal startup and report polling in [useDeploymentPlan.ts](./useDeploymentPlan.ts#L313-L344). The terminal has its own statuses in [remoteTerminal.ts](../../logic/remoteTerminal.ts#L41) and transitions in [useRemoteTerminal.ts](./useRemoteTerminal.ts#L152-L193) and [useRemoteTerminal.ts](./useRemoteTerminal.ts#L198-L327). Deploy outcomes render from the report at [GaStage.tsx](./GaStage.tsx#L790-L815). | Terminal connection state and deploy-report outcome stay separate from the operation monitor. |

### 1.2 Implement the internal operation state model — complete

Replace the nullable-error `StageRun` shape with a typed `idle | active | error` state, retaining `kind`, countdown, retry count, and message where applicable. Keep `Stage` reports, prerequisite assessments, plan-detail fetches, and the terminal session as their existing sources of truth.

Add buttons on each GaStage card to transition its operation state from any current state, regardless of existing dependency or transition guards:

| Button | Operation state and effects |
|---|---|
| Idle | Enter `idle` and stop tracking that card's current operation. |
| Plan active | Enter plan `active`, dispatch the plan workflow, and start report polling. |
| Deploy active | Enter deploy `active`, start the remote-terminal deployment workflow, and start report polling. |
| Plan error / Deploy error | Enter the selected operation's `error` state with an explicit forced-state message; do not claim a workflow actually failed. |

These are real transitions and normal operation effects, not a visual preview or simulated workflows. Controls are in the card intro in both locked and unlocked views. Missing inputs and failures are shown and logged; the card warns that plan and deploy can run real workflows even with unmet prerequisites.

When replacing or leaving an active operation, its local timer stops and late asynchronous results cannot change the newly selected state. Stopping local tracking does not cancel an already dispatched workflow; the card communicates that distinction. Each card's operation and terminal are independent. Idle and error do not fabricate report outcomes or change server data. Console info traces identify previous and next states, workflow dispatch, polling, resets and ignored stale results without logging credentials or workflow inputs. The GA terminal is rendered once in the intro so it remains accessible when locked.

Test every button from each operation state, real-effect dispatch and polling with mocked APIs, missing-input errors, timer/late-result isolation, independent cards, and environment reset. Use the resulting behavior to identify which guards are actually required in a later phase.

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