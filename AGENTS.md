# AGENTS.md

- UI and UI text follow [`DESIGN.md`](DESIGN.md). Read it before writing a screen, a component or any string a user sees.
- Strings live in `src/locales/<lang>.json` (French is the source) and `extension/_locales/`; never a literal in a component.
- Versions move one patch at a time (0.1.1 → 0.1.2). Never jump a minor for a small change.
- No DRM circumvention, ever: non-DRM sources only.
- Commits are authored by the repository owner only; no co-author trailers.
