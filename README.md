# NetsuCast

Lecteur vidéo Windows avec upscale IA en temps réel ([ArtCNN](https://github.com/Artoriuz/ArtCNN)).
Il reçoit les vidéos depuis Chrome (extension NetsuCast), une URL collée ou un fichier glissé.

## Périmètre

- ✅ Sites sans DRM : YouTube, X/Twitter, sites de streaming classiques, fichiers locaux.
- ❌ Contenu protégé par DRM (Netflix, Crunchyroll, ADN…) : hors périmètre, aucun contournement.

## Démarrer

```bat
run.bat
```

Menu `[1] Start NetsuCast`. Au premier lancement, le script télécharge mpv et yt-dlp dans
`tools\mpv\` (ignoré par git), installe les paquets pnpm puis lance `pnpm tauri dev`
(la première compilation Rust prend quelques minutes).

Prérequis : Node 22+, pnpm, Rust stable (MSVC), WebView2 (déjà présent sur Windows 11).

## Extension Chrome

`run.bat` → `[3]`, puis dans `chrome://extensions` : mode développeur → « Charger l'extension non
empaquetée » → dossier `extension\`.

- **Envoyer la page** : yt-dlp résout la vidéo (recommandé pour YouTube, X, Twitch…).
- **Flux détectés** : les `.m3u8` / `.mpd` / `.mp4` vus pendant la lecture dans l'onglet. Envoyés
  avec le Referer, le User-Agent et les cookies du site, que la plupart des CDN exigent.
- Clic droit sur une page, une vidéo ou un lien → « Lire dans NetsuCast ».

L'extension parle au récepteur local de l'appli : `http://127.0.0.1:47800` (port réglable des deux
côtés). Il n'écoute que la machine locale et refuse les requêtes venant de pages web.

## Lecteur

| Touche | Action |
| --- | --- |
| Espace / K | Lecture / pause |
| ← / → | −5 s / +5 s |
| J / L | −10 s / +10 s |
| ↑ / ↓ | Volume |
| M | Muet |
| F / double-clic | Plein écran (Échap pour sortir) |
| C | Sous-titre suivant |
| U | Modèle d'upscale suivant |
| I | Statistiques mpv |

Menus : sous-titres, piste audio, modèle ArtCNN (C4F16, C4F16 DS, C4F32, C4F32 DS), qualité source max
(jusqu'à 4K, pour les sites yt-dlp), vitesse, paramètres.

ArtCNN n'agit que si l'image est affichée au moins 1,3× plus grande que la source : une vidéo 1080p
dans une fenêtre 1080p n'est pas upscalée. Le badge à côté des menus indique l'état réel.

## Architecture

```
extension/            Chrome MV3 : détection des flux + envoi au récepteur
src/                  React + Tailwind : interface du lecteur (au-dessus de la vidéo)
src-tauri/src/
  receiver.rs         récepteur HTTP local (/ping, /cast)
  settings.rs         paramètres (JSON dans %APPDATA%\com.netsucast.app)
  tools.rs            recherche de mpv / yt-dlp, mise à jour de yt-dlp
src-tauri/resources/shaders/   shaders ArtCNN (MIT)
scripts/install-tools.ps1      téléchargement de mpv + yt-dlp
```

mpv tourne en processus séparé, dessiné dans la fenêtre Tauri (transparente) et piloté par IPC via
[tauri-plugin-mpv](https://github.com/nini22P/tauri-plugin-mpv).
