# ZBDeployUi

## Design decisions

Styling and accessibility plan: see [CSS_STANDARDISATION.md](corp-src/CSS_STANDARDISATION.md).

1. The MUI theme is the single source of truth for colour, typography and shape; `sx` is for layout and dynamic values only.
2. `corp-src/App.css` is the only first-party global stylesheet; it owns the focus ring, reduced motion, visually hidden and sensitive-value helpers, and app-wide CSS variables. Third-party component stylesheets may still be imported where required.
3. Use only `sans-serif` and `monospace` font families: `sans-serif` for UI content and `monospace` for technical elements. No web-font downloads or other font overrides.
4. Keep UI text between 0.75rem and 1rem and maintain contrast of at least 4.5:1, except intentionally muted card titles, which may use lower contrast.
5. Interactive elements are native or MUI-semantic (button, link, input), never `onClick` on a `Box`.
6. Test hooks (`id="card-<id>"`, `data-id`, `data-sensitive`, accessible names) are part of the UI contract.
7. Card title and chevron toggles are separate labelled controls; disable click ripples and retain a visible keyboard-focus outline.
8. A card title toggle's accessible name includes its visible title and summary, followed by visually hidden status text; expanded content is a region labelled by the card heading.
9. The installer shell has a skip link, one page-level `h1`, semantic main and footer landmarks, and one `h2` each for the deployment-card section and footer content. The landmarks themselves are not explicitly named with `aria-label`/`aria-labelledby`.
10. Links that open a new tab expose that behavior in their accessible name while keeping the visible label concise; inline text links are underlined for distinction.
11. Axe scans retain their default rules; only non-interactive muted card-title spans bearing `data-a11y-contrast-exception` are excluded from analysis for the documented contrast exception.
12. ESLint applies recommended jsx-a11y rules and blocks raw hex colors, `fontFamily`, and `fontSize` inside JSX `sx` in `corp-src/cards` and `corp-src/components`.
13. The footer shortcuts dialog opens with `?` when focus is outside editable controls; listed browser/control keys use native behavior.
14. Collapsed card titles and summaries stay on one line with ellipsis; full text remains in the DOM and accessible name, with a `title` attribute for pointer users.
