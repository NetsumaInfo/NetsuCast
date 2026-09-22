# NetsuCast

Application Windows qui récupère le flux vidéo d'un site web et le lit dans un lecteur avec upscale IA en temps réel ([ArtCNN](https://github.com/Artoriuz/ArtCNN)).

La qualité des vidéos en ligne est souvent mauvaise : NetsuCast intercepte le flux (`.m3u8`, `.mp4`) et l'envoie à un lecteur basé sur mpv qui applique un shader ArtCNN sur le GPU.

## Périmètre

- ✅ Sites sans DRM : YouTube, X/Twitter, sites de streaming classiques.
- ❌ Contenu protégé par DRM (Netflix, Crunchyroll, ADN…) : hors périmètre, aucun contournement.

## Architecture visée

```
NetsuCast (Tauri : Rust + React + Tailwind)
├─ Navigateur intégré (WebView2) : connexion aux sites, interception des flux + cookies/Referer
├─ Résolution : yt-dlp (YouTube, X, +1000 sites) ou flux intercepté
└─ Lecteur : mpv + shader ArtCNN (C4F16, C4F16_DS, C4F32, C4F32_DS)
```

## Stack

- [Tauri 2](https://tauri.app) (Rust) + React + TypeScript + Tailwind CSS 4
- Shaders ArtCNN (MIT) dans `src-tauri/resources/shaders/`

## Développement

Prérequis : Node 22+, pnpm, Rust stable (MSVC), WebView2.

```bash
pnpm install
pnpm tauri dev
```
