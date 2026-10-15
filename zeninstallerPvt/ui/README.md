# ZBDeployUi

## Design decisions

Styling and accessibility plan: see [CSS_STANDARDISATION.md](corp-src/CSS_STANDARDISATION.md).

1. The MUI theme is the single source of truth for colour, typography and shape; `sx` is for layout and dynamic values only.
2. `corp-src/App.css` is the only first-party global stylesheet; it owns the focus ring, reduced motion, visually hidden and sensitive-value helpers, and app-wide CSS variables. Third-party component stylesheets may still be imported where required.
3. Use only `sans-serif` and `monospace` font families: `sans-serif` for UI content and `monospace` for technical elements. No web-font downloads or other font overrides.
4. Keep UI text between 0.75rem and 1rem and maintain contrast of at least 4.5:1, except intentionally muted card text and semantic status summaries, which may use lower contrast.
5. Interactive elements are native or MUI-semantic (button, link, input), never `onClick` on a `Box`.
6. Test hooks (`id="card-<id>"`, `data-id`, `data-sensitive`, accessible names) are part of the UI contract.
7. Card title and chevron toggles are separate labelled controls; disable click ripples and retain a visible keyboard-focus outline.
8. The card title toggle includes status in its accessible name; expanded content is a region labelled by the card heading.
9. The installer shell has a skip link, one page-level `h1`, labelled main and footer landmarks, and one `h2` each for the deployment-card section and footer.
10. Links that open a new tab expose that behavior in their accessible name while keeping the visible label concise.
