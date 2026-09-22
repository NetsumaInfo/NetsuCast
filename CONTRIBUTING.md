# Contributing to NetsuCast

Thanks for your interest in NetsuCast.

Useful contributions include bug fixes, playback and upscaling performance work, accessibility, translations, documentation, and support for more non-DRM sites through the extension.

## Before you start

- Search existing issues before opening a new one.
- For a significant feature or any change to the workflow or architecture, open an issue first so the direction can be agreed.
- Keep one pull request focused on one change; avoid unrelated edits.
- **No DRM circumvention, ever.** NetsuCast only plays sources without DRM; a change that works around a protection is refused whatever its quality.

## Language

- Code, identifiers, commit messages, pull requests and issues: **English**.
- User-facing text is never hard-coded. Add keys to every locale under `src/locales/` (French is the source language) and to `extension/_locales/` for the extension. UI and wording follow [`DESIGN.md`](DESIGN.md).

## Local setup

Requirements: Windows, Node.js 22+, pnpm 9, Rust stable (MSVC), WebView2.

```bash
git clone https://github.com/NetsumaInfo/NetsuCast.git
cd NetsuCast
pnpm install
pnpm tools        # downloads mpv, yt-dlp and deno into tools/mpv/ (git-ignored)
pnpm tauri dev
```

`run.bat` does the same from a menu. The first Rust build takes a few minutes.

## Pull requests

1. Branch from `main` with a clear name, e.g. `fix/cast-referer` or `feat/subtitle-picker`.
2. Follow the existing conventions (`AGENTS.md`, `DESIGN.md`).
3. Do not add a dependency without a clear need. A new runtime dependency (binary, DLL, script, asset) must also update packaging — see [`docs/releasing.md`](docs/releasing.md) and [`docs/licensing.md`](docs/licensing.md).
4. Explain what changes, why, any trade-offs, and how you verified it.
5. List the checks you actually ran, and say clearly what you could not test.
6. Add screenshots or a short clip for visual changes.
7. Do not mix a broad refactor with a behaviour change in the same pull request.
8. Do not bump the version in a pull request; releases move one patch at a time.

## Checks

| Layer | Command |
|---|---|
| Renderer (`src/`) | `pnpm build` |
| Rust shell (`src-tauri/`) | `cargo check --locked` in `src-tauri/` |
| Updater manifest script | `node scripts/create-update-manifest.mjs --dry-run` |

Changes to `src-tauri/**` require a full restart of `pnpm tauri dev` before runtime testing.

By contributing you agree that your contribution is distributed under the project's [GNU AGPL v3.0](LICENSE) licence, and you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
