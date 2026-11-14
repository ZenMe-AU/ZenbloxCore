# ZBDeployUi

## Design decisions

Current UI behaviour, styling and accessibility guidance, verification results and remaining work: see [UI_UX.md](UI_UX.md). Documentation reviewed 2026-11-12.

1. The MUI theme is the single source of truth for colour, typography and shape; `sx` is for layout and dynamic values only. Custom theme overrides that must follow the selected light/dark scheme use `theme.vars.palette`, not raw default-palette values.
2. `corp-src/App.css` is the only first-party global stylesheet; it owns the focus ring, reduced motion, visually hidden and sensitive-value helpers, and app-wide CSS variables. Third-party component stylesheets may still be imported where required.
3. Use only `sans-serif` and `monospace` font families: `sans-serif` for UI content and `monospace` for technical elements. No web-font downloads or other font overrides.
4. Keep UI text between 0.75rem and 1rem and maintain contrast of at least 4.5:1, except intentionally muted card titles, which may use lower contrast.
5. Commands use native or MUI-semantic buttons, links and inputs. Informational `InfoTip` surfaces are named, focusable spans that expose descriptions without implying a command. The card header is an intentional exception for pointer activation: its wrapper toggles the card, while the title and chevron controls remain keyboard-operable.
6. Test hooks (`id="card-<id>"`, `data-id`, `data-sensitive`, accessible names) are part of the UI contract.
7. The card header toggles on click, and its title and chevron are separate labelled keyboard-operable controls; expanded-card actions do not bubble into the header toggle. Disable click ripples and retain a visible keyboard-focus outline.
8. A card title toggle's accessible name includes its visible title and summary, followed by visually hidden status text; expanded content is a region labelled by the card heading. Summaries remain visible when expanded. Locked cards show direct requirement labels such as "Sign in to AWS"; blocked stage summaries name missing values directly, while failed-plan summaries avoid a redundant "Failed:" prefix.
9. The installer shell has a skip link, one page-level `h1` sourced from `document.title`, semantic main and footer landmarks, an accessible-name-labelled deployment-progress section, and an `h2` for footer content. The decorative ZB mark is hidden from assistive technology. There is no separate “Deployment steps” heading; the landmarks themselves are not explicitly named with `aria-label`/`aria-labelledby`.
10. Links that open a new tab expose that behavior in their accessible name while keeping the visible label concise; links use theme styling and do not rely on underlines for distinction.
11. Axe scans retain their default rules; only non-interactive muted card-title spans bearing `data-a11y-contrast-exception` are excluded from analysis for the documented contrast exception.
12. ESLint applies recommended jsx-a11y rules and blocks raw hex colors, `fontFamily`, and `fontSize` inside JSX `sx` in `corp-src/cards` and `corp-src/components`.
13. The footer shortcuts dialog opens with `?` when focus is outside editable controls; listed browser/control keys use native behavior.
14. Collapsed card titles and summaries stay on one line with ellipsis; full text remains in the DOM and accessible name, with a `title` attribute for pointer users. Expanded headings and summaries sit alongside one another and wrap at narrow widths.
15. The installer follows the browser's reported system color scheme by default, honoring either light or dark. If the browser cannot expose a color-scheme preference, it falls back to dark. The header button cycles System, Light, and Dark; explicit Light/Dark selections persist and override the system preference until switched back to System.
16. The UI targets modern evergreen browsers supported by its Vite, React, and MUI versions; legacy browsers such as Internet Explorer are not supported. Optional browser features use fallbacks where practical: clipboard writes use a legacy copy path and announce failures, UUID generation uses secure `getRandomValues`, and `color-mix()` styling is progressively enhanced. Forced-colors mode retains a system-color keyboard focus outline. Chromium has the broad automated coverage; opt-in Firefox/WebKit projects cover unauthenticated accessibility, keyboard navigation and responsive headers. Passing Playwright WebKit on Windows does not certify shipping Safari on macOS/iOS or authenticated deployment flows.
17. Where provided, card introductions and pipeline-stage descriptions remain available when a card is locked, ahead of its unmet-prerequisite list.
18. Text buttons use a compact shared MUI baseline (32px minimum height, 0.875rem semibold text, 6px radius, consistent padding); primary, outlined, destructive, and toggle roles retain their distinct states.
19. `Shift+C` collapses all expanded cards; global shortcuts do not run while focus is in editable controls or the shortcuts dialog. Collapse-all moves focus from closing content to its heading. Prerequisite and next-step jumps focus the destination heading and respect reduced motion; ordinary toggles retain focus and the origin card stays open during a jump.
20. `StepRow` exposes each state as visually hidden text and names running progress indicators; status icons remain decorative.
21. Static `ConfigErrorNotice` text is associated with the unavailable card's title and chevron controls through `aria-describedby`; it is not announced as a live alert.
22. `MONO_FONT` and `refreshBtnSx` remain shared helpers while they have active consumers; field labels use the `fieldLabel` typography variant directly.
23. Variable descriptions have stable `aria-describedby` relationships to their inputs; help, drift, overwrite and stale-plan explanations are available on keyboard focus as well as hover. New information surfaces and touched variable clear/revert controls have at least 24px targets. Tooltip values retain sensitive-content markers.
24. An Azure tenant shown as an MSA or app-result prefill is not considered confirmed for ARM access. A saved tenant is probed on startup, explicit tenant selection is confirmed through ARM access, and a late startup probe must not overwrite a tenant the user has since confirmed.
25. Stage plan actions and plan-failure details are available only while the live prerequisites are met. Missing or whitespace-only prerequisite values keep the stage in a warning state and identify the missing inputs; users can still edit stage variables to resolve blockers.

## Test automation

- Stable UI test hooks and the muted-title-only axe exception above remain part of the test contract; no axe rules are disabled.
- Vitest uses the `unit` (jsdom) and `web` (Chromium) projects. The root Playwright configuration retains the existing Chromium project; setting `UX_BROWSERS=1` enables `ux-firefox` and `ux-webkit`, restricted to tagged `@ux-smoke` cases in the accessibility spec. Existing Chromium snapshot baselines are not shared across engines.
- `BASE_URL` overrides the Playwright test URL and web-server readiness URL/port consistently. Responsive smoke screenshots are retained artifacts, not replacement snapshot baselines. Capture expanded cards after their collapse transition has completed.
- Scheme-sensitive browser assertions wait for observable computed styles to settle rather than relying on fixed sleeps.
- See [UI_UX.md verification](UI_UX.md#10-verification-map) for dated results, reproducible opt-in commands and known test/lint limitations. Automated checks do not replace manual platform or assistive-technology validation.

## Known accessibility follow-ups

- Manual keyboard-only deployment, screen-reader, 200% zoom, and Windows high-contrast/reduced-motion checks remain outstanding. Focusable explanations and input descriptions are implemented, but their real assistive-technology behaviour still needs validation.
- A broader touch-target redesign and confirmations for destructive actions remain deferred product decisions.

## Other follow-ups

- Browser `dotenv` imports still produce Node-module externalization warnings. Both API parsing paths have browser regression coverage, but a compatible browser-only parser must be selected and approved before replacement; deployment-side usage remains unchanged.
- Access Pass null-telemetry failures and unrelated lint findings remain open. Footer Contact/Terms content and the unused `GlobalGroupsCard` also require decisions. The current checklist is maintained in [UI_UX.md](UI_UX.md#11-remaining-work).
