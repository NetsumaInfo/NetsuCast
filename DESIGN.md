# Design

<!-- Written with netsu-peccable. Read this before writing any screen, component or string a
user will see. Keep it short: a rule nobody follows is noise. -->

## Product

- What it is: a video player that continues a browser video on the PC, upscaled live by ArtCNN.
- Who uses it, and where: one person watching anime, YouTube or streaming sites on a Windows PC,
  often in a dim room, often full screen. The picture matters more than the interface.
- Platforms: desktop (Tauri, Windows) and a Chromium browser extension.

## Voice

- UI languages: fr (source), en, es, de, it, pt-BR, nl, pl, ru, uk, tr, ja, ko, zh-CN, zh-TW,
  ar, he. Translations follow the French source, not the reverse. `ar` and `he` render right to
  left, except the seek bar and times.
- Address: fr tu, es tú, de du, it tu, pt-BR você, nl je, pl ty, ru ты, uk ти, tr sen,
  ja です・ます, ko 해요체, zh 你. One form per language, never mixed.
- Market: fr-FR, es neutral, de-DE, pt-BR, zh-CN and zh-TW as two locales.
- Script conventions: ja buttons as verbs, no space before Latin words, full-width ？！, ellipsis …;
  zh no space typed before Latin words.
- Tone: direct, calm, precise. Not: cute, salesy, technical for its own sake.
- Everyday words: a string must be something a user could say out loud to a friend.
- Sentence case everywhere: buttons, titles, menus, tabs.

### Words we use

| Concept | FR | EN | Never say |
|---|---|---|---|
| Sending a video to the app | caster | cast | streamer, envoyer au récepteur |
| The browser add-on | l'extension | the extension | plugin, module |
| The AI enlargement | l'upscale | upscale | super-résolution, IA magique |
| ArtCNN variants | modèle | model | preset, filtre |
| Video source cap | qualité source | source quality | résolution d'entrée |
| The home screen | l'accueil | home | dashboard |

### Examples

| Where | FR | EN |
|---|---|---|
| Primary button | Installer l'extension | Install the extension |
| Error | YouTube demande ta session, mais aucun cookie n'est arrivé. | YouTube wants your session, but no cookie came through. |
| Empty state | Survole une vidéo dans ton navigateur et clique sur NetsuCast. | Hover a video in your browser and click NetsuCast. |
| Status | Préparation de C4F32 DS… (première fois seulement) | Preparing C4F32 DS… (first time only) |

## Look

- Direction: a quiet dark player where the video is the only bright thing; controls appear on
  demand and disappear. Minimal: one accent, no decoration.
- Looks like: mpv, IINA, the YouTube player chrome. Does not look like: a dashboard, a gaming
  overlay, glowing neon.
- Density: compact. Themes: "Dark" by default (reason: video in a dim room; the picture must
  dominate), plus the ten other palettes of NetsuRush (the user's choice, 2026-09-23): midnight,
  navy, graphite, forest, ember, plum, high contrast, light, soft light, paper. Switched with
  `data-theme` on `<html>`; `scripts/make-themes.mjs` derives each palette's tokens and tunes them
  until every pair passes. The player chrome over the video (`.on-video`) stays dark in the
  light themes.
- Fonts: Segoe UI Variable, then the system stack (reason: native Windows app, nothing to load).
- Colors: tokens in `src/index.css` `@theme`. Accent blue (the user's choice, 2026-09-23):
  `accent` #2F6FE0 for fills with white ink (4.70), `accent-text` #4C8DFF for text, icons and
  focus on dark (5.71 on surface). Accent only for the primary action, the current selection,
  progress and focus.
- Radius: 6 px controls, 10 px panels and dialogs, full only for chips. Shadows: one level, for
  overlays only.
- Spacing scale: 4 8 12 16 24 32.
- Icons: lucide-react, 1.75 stroke, 16 to 20 px. One library only.
- Motion: minimal. 120 to 180 ms on opacity, colour and transform. Reduced motion keeps the
  feedback and drops the movement.
- Custom tooltips (raised chip, shortcut in muted text), selects (`SelectInput`, a listbox) and
  thin scrollbars; never the native ones. The extension's cast button has its own tooltip in the
  same style.

## Components

- Library: the project's own, in `src/components` (`ui.tsx` holds the shared primitives).
- Every interactive component has: default, hover, focus-visible, active, disabled (with the
  reason shown), loading, error, and empty when it holds data.

## Checks

- The netsu-peccable `copy` scan on `src src/locales`: interface text
- The netsu-peccable `ui` scan on `src`: generic AI look, focus, transitions
- `pnpm build` (types), `cargo check` in `src-tauri`
