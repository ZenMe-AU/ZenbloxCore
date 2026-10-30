# ZBDeployUi

## Design decisions

Styling and accessibility plan: see [CSS_STANDARDISATION.md](CSS_STANDARDISATION.md).

1. The MUI theme is the single source of truth for colour, typography and shape; `sx` is for layout and dynamic values only.
2. `corp-src/App.css` is the only first-party global stylesheet; it owns the focus ring, reduced motion, visually hidden and sensitive-value helpers, and app-wide CSS variables. Third-party component stylesheets may still be imported where required.
3. Use only `sans-serif` and `monospace` font families: `sans-serif` for UI content and `monospace` for technical elements. No web-font downloads or other font overrides.
4. Keep UI text between 0.75rem and 1rem and maintain contrast of at least 4.5:1, except intentionally muted card titles, which may use lower contrast.
5. Interactive elements are native or MUI-semantic (button, link, input). The card header is an intentional exception for pointer activation: its wrapper toggles the card, while the title and chevron controls remain keyboard-operable.
6. Test hooks (`id="card-<id>"`, `data-id`, `data-sensitive`, accessible names) are part of the UI contract.
7. The card header toggles on click, and its title and chevron are separate labelled keyboard-operable controls; expanded-card actions do not bubble into the header toggle. Disable click ripples and retain a visible keyboard-focus outline.
8. A card title toggle's accessible name includes its visible title and summary, followed by visually hidden status text; expanded content is a region labelled by the card heading.
9. The installer shell has a skip link, one page-level `h1`, semantic main and footer landmarks, an accessible-name-labelled deployment-progress section, and an `h2` for footer content. There is no separate “Deployment steps” heading; the landmarks themselves are not explicitly named with `aria-label`/`aria-labelledby`.
10. Links that open a new tab expose that behavior in their accessible name while keeping the visible label concise; links use theme styling and do not rely on underlines for distinction.
11. Axe scans retain their default rules; only non-interactive muted card-title spans bearing `data-a11y-contrast-exception` are excluded from analysis for the documented contrast exception.
12. ESLint applies recommended jsx-a11y rules and blocks raw hex colors, `fontFamily`, and `fontSize` inside JSX `sx` in `corp-src/cards` and `corp-src/components`.
13. The footer shortcuts dialog opens with `?` when focus is outside editable controls; listed browser/control keys use native behavior.
14. Collapsed card titles and summaries stay on one line with ellipsis; full text remains in the DOM and accessible name, with a `title` attribute for pointer users.
15. The installer follows the browser's reported system color scheme by default, honoring either light or dark. If the browser cannot expose a color-scheme preference, it falls back to dark. The header button cycles System, Light, and Dark; explicit Light/Dark selections persist and override the system preference until switched back to System.
16. The UI targets modern evergreen browsers supported by its Vite, React, and MUI versions; legacy browsers such as Internet Explorer are not supported. Optional browser features use fallbacks where practical: clipboard writes use a legacy copy path and announce failures, UUID generation uses secure `getRandomValues`, and `color-mix()` styling is progressively enhanced. Forced-colors mode retains a system-color keyboard focus outline. Automated browser coverage currently runs Chromium; Firefox and Safari/WebKit remain unverified.
17. Where provided, card introductions and pipeline-stage descriptions remain available when a card is locked, ahead of its unmet-prerequisite list.
18. Text buttons use a compact shared MUI baseline (32px minimum height, 0.875rem semibold text, 6px radius, consistent padding); primary, outlined, destructive, and toggle roles retain their distinct states.
