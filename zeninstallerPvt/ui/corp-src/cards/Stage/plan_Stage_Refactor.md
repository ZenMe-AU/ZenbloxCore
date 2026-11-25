# Stage Card Refactor Plan

## Goal

Refactor the stage cards incrementally while preserving a directly comparable legacy implementation.

The new implementation will intentionally be independent from the old card. Compatibility links should be temporary and explicitly marked. The final target is explicit, statically typed stage cards rather than dynamically generated stage instances.

## Step A: Create the independent GaStage implementation

### A.0 Build the legacy StageCard test suite

Build and run the test suite for the existing StageCard implementation before making refactoring changes. This establishes the known baseline for current behavior, including behavior that may later be classified as incorrect and fixed separately.

Cover at least:

- repository/prerequisite locked state;
- ready state;
- missing prerequisites;
- changed prerequisites;
- plan refresh available;
- plan running;
- plan failure and retry;
- successful plan;
- deploy ready;
- deployment running;
- deployment completed;
- deployment failed or cancelled;
- expansion and card navigation;
- remote-terminal behavior.

Do not rely only on snapshots. Tests should assert observable state, actions, and side effects.

You are allowed to make changes to StageCard to get the tests to pass.
Record notes of any changes that were needed, and stop here.
Wait for human to do code review and to commit the passing baseline test suite before continuing.



### A.1 Create and render GaStage

1. Clone `StageCard.tsx` as `GaStage.tsx` or a `GaStage` folder with the minimum name-only changes needed to compile.
2. Keep the implementations independent so old and new behavior can be compared and changed separately.
3. Add the GaStage instances to `App.tsx` alongside the existing StageCard instances.
4. Give every old and new card independent:
   - card ID;
   - expanded-state identity;
   - DOM anchors and test IDs;
   - progress entry;
   - permissions hooks;
   - remote-terminal/session identity;
   - plan/deploy run tracking identity.
5. Do not let a new card depend on deleting or reconfiguring an old card.

The old and new UI intentionally coexist during this step. This duplicates network and permission checks, which is accepted as a controlled migration cost.

### A.2 Add independent parity tests

Create an independent test suite for GaStage. Reuse the scenario definitions from the A.0 legacy suite where practical, but keep the old and new test files and assertions independent.

Confirm the GaStage suite covers:

- repository/prerequisite locked state;
- ready state;
- missing prerequisites;
- changed prerequisites;
- plan refresh available;
- plan running;
- plan failure and retry;
- successful plan;
- deploy ready;
- deployment running;
- deployment completed;
- deployment failed or cancelled;
- independent expansion and card navigation;
- independent remote-terminal behavior.

Compare failures and results across the two suites so that missing legacy functionality is identified before it is added to later GaStage iterations.

### A.3 Human review and commit

Commit only after:

- old and new cards render independently;
- the parity suites pass for both implementations;
- known differences are documented;
- the extra StageCard instances are intentional and reviewable.

## Step B: Extract explicit stage cards

Perform this step one stage at a time.

### B.1 Extract GaSubscriptionBudget

1. Create an explicit `GaSubscriptionBudget` card.
2. Supply its stage definition and dependencies explicitly rather than discovering it through the dynamic stage map.
3. Compose the card from `GaStage` initially.
4. Replace only the SubscriptionBudget dynamic rendering/model lookup in `App.tsx`.
5. Keep `GaStage` as the shared component until there is a concrete reason to move behavior.
6. Move stage-specific behavior into `GaSubscriptionBudget` as it diverges or becomes independently testable.
7. Add an independent SubscriptionBudget test suite.
8. Human review and commit.

### B.2 Extract GaCloudFront

After the SubscriptionBudget extraction is committed:

1. Create an explicit `GaCloudFront` card.
2. Supply its stage definition and dependencies explicitly.
3. Compose it from `GaStage`.
4. Replace the remaining CloudFront dynamic rendering/model lookup.
5. Add an independent CloudFront test suite.
6. Remove dynamic Stage rendering when both concrete cards are migrated.
7. Human review and commit.

### B.3 Intentional identifier and integration breaks

The new cards intentionally break links to the old implementation where retaining a link would hide a required design decision.

Audit and explicitly replace:

- dynamic card IDs;
- `useCorpStageCards` model lookup;
- dynamic rendering in `App.tsx`;
- progress-card registration;
- expanded-card persistence;
- prerequisite targets;
- remote-terminal identity;
- plan/deploy polling and run keys;
- card navigation anchors.

Avoid compatibility layers. If one is necessary to keep the application running between commits, mark it as a temporary workaround and name the phase in which it will be removed.

## Step C: Re-evaluate

After both concrete cards exist and the dynamic Stage path is removed, review the next refactor boundaries:

- split shared UI into explicit panels;
- move server state to TanStack Query;
- replace legacy `CardChrome` with `BaseCard`;
- introduce explicit state machines;
- register cards and typed outputs in AppContext;
- move shared behavior into `GaStage`;
- move stage-specific behavior into the concrete cards;
- remove the legacy StageCard implementation;
- remove obsolete dynamic helpers and compatibility code.

## Commit gates

### Gate A

Old StageCard and GaStage coexist with independent IDs, tests, and behavior.

### Gate B1

GaSubscriptionBudget is explicit and independently tested; its legacy dynamic entry is removed.

### Gate B2

GaCloudFront is explicit and independently tested; dynamic Stage rendering is removed.

### Gate C

The remaining architecture work has been reviewed and broken into separate, phase-sized changes.

## Future required changes

These are intentionally outside the structural refactor. Capture parity first, then address them in separately reviewed behavior changes.

- `StageCard.tsx` currently creates one remote-terminal hook/session but renders `RemoteTerminal` in two locations. The new cards should initially preserve this behavior for parity, then consolidate it after the structural migration.
