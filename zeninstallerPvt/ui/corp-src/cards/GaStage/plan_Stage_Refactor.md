# Remaining Stage Card Refactor Plan

## Goal

Refactor the stage cards incrementally while preserving a directly comparable legacy implementation.

The new implementation will intentionally be independent from the old card. Compatibility links should be temporary and explicitly marked. The final target is explicit, statically typed stage cards rather than dynamically generated stage instances.


## Remaining state work

The operation states and their force controls exist; their source-mapped transition reference is at the bottom of this document. The other state below already exists in the current card but has not been evaluated for the remaining refactor. Do not assume it should be merged into the operation machine.

| State to evaluate | Existing source and remaining decision |
|---|---|
| Server plan/deploy results | [StageStatus and DeployStatus](../../types.ts#L303) describe plan results and the separate deployment outcome; [report merging](./useDeploymentPlan.ts#L228) and [effective status](../../logic/stage.ts#L68) determine presentation. Preserve report authority, including failed/cancelled deploy with a still-valid plan; determine how results map to the eventual card lifecycle. |
| Report loading, availability and summaries | [useDeploymentPlan](./useDeploymentPlan.ts#L77) holds `stagesLoading`, `hasPlan`, summaries and deployed environment; [report loading and reset](./useDeploymentPlan.ts#L164) update them. Decide their ownership when server state moves to TanStack Query, preserving per-stage summaries and environment changes. |
| Repository lock and prerequisites | [Card model](./createGaStageCardModel.ts#L75) derives repository lock, missing/incomplete/changed inputs and operation-based action gating; [assessment](../../logic/stage.ts#L90) and [plan rendering](./GaStage.tsx#L571) consume them. Exercise the real force controls and normal actions before deciding which guards are required; keep force transitions available regardless of those guards. |
| Azure access and provider checks | [ArmGaStage](./GaStage.tsx#L825) owns management access, plan-app access and provider checks; [permission checks](./GaStage.tsx#L494) are separate. Evaluate their checking, warning, error, registration and retry states and how they affect normal actions and card presentation without conflating them with operation state. |
| Plan details and failure logs | [Request-keyed plan result and logs](./GaStage.tsx#L481), [fetch effects](./GaStage.tsx#L531) and [plan detail](./GaStage.tsx#L723) hold loading, results and errors independently. Decide ownership and test stale responses when reports or environment change. |
| Remote terminal | [TerminalStatus](../../logic/remoteTerminal.ts#L41), [connection/session transitions](./useRemoteTerminal.ts#L152), and [runner messages](./useRemoteTerminal.ts#L162) are separate from report polling. Evaluate their interaction with operation replacement and environment changes; do not equate terminal completion with a completed deployment report. |
| Local interaction state | [Variable editor](./GaStage.tsx#L123) owns draft values, updates and per-variable errors; [card content](./GaStage.tsx#L479) owns disclosure state, and [card model](./createGaStageCardModel.ts#L103) carries expansion. Decide what stays local during panel and BaseCard migration; preserve unsaved edits and error feedback. |
| Card presentation and BaseCard lifecycle | [CardStatus projection](../../logic/stage.ts#L151), [model precedence](./createGaStageCardModel.ts#L83) and [access-error override](./GaStage.tsx#L599) determine the current shell. Compare these with [BaseCard lifecycle presentation](../../components/BaseCard.tsx#L37), including locked/blocked, loading, ready, action, commit, complete, error and force-unlocked; specify precedence and mapping before migration rather than merging states by name. |

### Next: re-evaluate against BaseCard

Use the inventory and interactive transition testing to propose a source-mapped lifecycle/guard design. Document which concerns stay independent, precedence when states overlap, and which actions remain available. Verify the proposed mapping against locked cards, missing/changed prerequisites, loading, plan/deploy results, terminal failures and operation overrides before changing the implementation.


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

## Technical design: implemented transitions and triggers

The following locations describe the **per-card operation**, not a unified card or terminal lifecycle. [StageRun and StageOperation](./useDeploymentPlan.ts#L21) define `idle`, plan/deploy `active`, and plan/deploy `error`. The [run map](./useDeploymentPlan.ts#L80) is keyed by stage; no entry means idle. The [card model](./createGaStageCardModel.ts#L146) supplies that default and binds the card's callbacks to its stage key. [begin](./useDeploymentPlan.ts#L94) stops the old timer, advances the generation and records the new state; [update](./useDeploymentPlan.ts#L109) only applies results from the current generation.

### Operation transitions

| Trigger | Transition and effects |
|---|---|
| [**Idle** button](./GaStage.tsx#L583) | Any state -> idle via [forceIdle](./useDeploymentPlan.ts#L365) and [begin](./useDeploymentPlan.ts#L94); stops the local timer and invalidates pending results. Does not cancel a dispatched workflow. |
| [**Plan active** button](./GaStage.tsx#L584) | Any state -> plan active via [forcePlan](./useDeploymentPlan.ts#L327) and [runPlan](./useDeploymentPlan.ts#L288); bypasses normal plan guards, then validates essential inputs, [dispatches the real workflow](./useDeploymentPlan.ts#L307) and [starts polling](./useDeploymentPlan.ts#L319). Missing inputs or dispatch/branch failures transition to plan error. |
| Normal [**Get Updated Plan**](./GaStage.tsx#L684) / [prerequisite refresh](./GaStage.tsx#L669) | Enters plan active after the UI, [model](./createGaStageCardModel.ts#L138) and hook guards pass; [onRun](./useDeploymentPlan.ts#L326) and [runPlan](./useDeploymentPlan.ts#L288) use the same dispatch and subsequent transitions as forced plan. |
| [**Deploy active** button](./GaStage.tsx#L585) | Any state -> deploy active via [forceDeploy](./useDeploymentPlan.ts#L363) and [startDeploy](./useDeploymentPlan.ts#L329); bypasses normal card and access checks, but still requires an account, repository, environment, plan run and deploy workflow. Starts the real [remote-terminal workflow](./useRemoteTerminal.ts#L274) and then polling; missing inputs or startup failure transition to deploy error. |
| Normal [**Deploy** button](./StagePlanDetail.tsx#L57) | Enters deploy active via [deployStage](./useDeploymentPlan.ts#L362) and [startDeploy](./useDeploymentPlan.ts#L329) when the normal [model](./createGaStageCardModel.ts#L116) and UI guards allow it; its [startup callback](./GaStage.tsx#L510) checks management access before starting the terminal. Startup failure transitions to deploy error. |
| [**Plan error** / **Deploy error** buttons](./GaStage.tsx#L586) | Any state -> selected error state via [forceError](./useDeploymentPlan.ts#L366), with a forced-state message; no workflow failure or server result is fabricated. |
| [Poll countdown](./useDeploymentPlan.ts#L147) / [report not newer than dispatch](./useDeploymentPlan.ts#L194) | Active -> active: updates countdown and retries, then fetches reports. [Delays](./useDeploymentPlan.ts#L45) are 150, 180, 200 and 300 seconds; [exhausting attempts](./useDeploymentPlan.ts#L198) transitions to the corresponding error state via [fail](./useDeploymentPlan.ts#L126). |
| [Newer report received](./useDeploymentPlan.ts#L194) | Active -> idle via [update](./useDeploymentPlan.ts#L205); report data is separately [merged](./useDeploymentPlan.ts#L228) into the server-derived stage state. Returning to idle means tracking completed, not necessarily that the workflow succeeded. |
| [Unexpected aggregate report-load failure](./useDeploymentPlan.ts#L245) | Active -> corresponding error via [fail](./useDeploymentPlan.ts#L126). [Individual report fetch failures](./useDeploymentPlan.ts#L172) are logged and treated as absent reports, so polling can retry and eventually time out. |
| [Selected environment ID changes](./useDeploymentPlan.ts#L264) | All tracked operations -> idle as the [run map is cleared](./useDeploymentPlan.ts#L273); timers stop, generations advance, and report-derived local state is reset. |
| [Hook unmounts](./useDeploymentPlan.ts#L130) | Stops timers and invalidates outstanding operations; this is cleanup, not a persisted idle transition or workflow cancellation. |

### Async events, presentation and diagnostics

- **Late results:** [generation checks](./useDeploymentPlan.ts#L109) reject stale updates and [report responses](./useDeploymentPlan.ts#L185); [plan dispatch](./useDeploymentPlan.ts#L313) and [deploy startup](./useDeploymentPlan.ts#L341) also check whether tracking has been replaced. During terminal registration, [isCurrent](./useRemoteTerminal.ts#L300) prevents an abandoned operation from dispatching a new workflow. It cannot cancel a workflow already dispatched.
- **Polling and display:** The [poll timer](./useDeploymentPlan.ts#L147) updates countdown/retry fields. The [model](./createGaStageCardModel.ts#L78) derives active/error presentation and the intro shows the [current operation](./GaStage.tsx#L589), controls and warning. The [same intro](./GaStage.tsx#L596) contains one terminal and is also passed as [lockedIntro](./GaStage.tsx#L608).
- **Terminal lifecycle:** Registration, dispatch and connection use the terminal's own statuses, independently of operation state; see [start](./useRemoteTerminal.ts#L274), [connect and reconnect](./useRemoteTerminal.ts#L198), [runner messages](./useRemoteTerminal.ts#L162), and [stop](./useRemoteTerminal.ts#L152). Terminal completion is not itself an operation-idle trigger; the operation waits for its report.
- **Tracing:** [trace](./useDeploymentPlan.ts#L86), [begin](./useDeploymentPlan.ts#L94) and [update](./useDeploymentPlan.ts#L109) log stage, operation generation, previous/next state and relevant dispatch, polling or stale-result events at console info level. Errors remain visible. [Application Insights](../../monitor/applicationInsights.ts#L12) still collects telemetry, but envelope logging defaults off and can be explicitly enabled with `debug: true`.
- **Verification:** [operation tests](../../test/GaStageDeploymentPlan.test.tsx#L70) cover transitions, dispatch, polling and stale results; [terminal tests](../../test/GaStageRemoteTerminal.test.tsx#L34) cover abandoned startups; [card tests](../../test/GaStage.test.tsx#L408) cover locked controls and a single terminal; [monitor tests](../../test/applicationInsights.test.ts#L30) cover logging defaults and opt-in.