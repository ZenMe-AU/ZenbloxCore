# ZBDeployUi

## Design decisions

Styling and accessibility plan: see [CSS_STANDARDISATION.md](CSS_STANDARDISATION.md).

1. The MUI theme is the single source of truth for colour, typography and shape; `sx` is for layout and dynamic values only.
2. `corp-src/App.css` holds global, non-component rules only (focus ring, reduced motion, card width variables).
3. Use `sans-serif` as the primary font for all main UI content, with Arial only as a fallback; use `monospace` only for technical elements. No web-font downloads or other font overrides.
4. Meaningful text is at least 0.875rem with contrast of at least 4.5:1.
5. Interactive elements are native or MUI-semantic (button, link, input), never `onClick` on a `Box`.
6. Test hooks (`id="card-<id>"`, `data-id`, `data-sensitive`, accessible names) are part of the UI contract.