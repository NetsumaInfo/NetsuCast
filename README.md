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

## Caster depuis Chrome

Installation (une fois) : `run.bat` → `[3]`, puis dans `chrome://extensions` : mode développeur →
« Charger l'extension non empaquetée » → dossier `extension\`.

- **Bouton NetsuCast sur la vidéo** : il apparaît au survol de n'importe quelle vidéo (iframes
  comprises). Un clic met la vidéo en pause dans Chrome et la continue dans l'appli, au même moment.
- **Icône de l'extension ou Alt+Maj+C** : même chose pour la vidéo principale de l'onglet.
- Clic droit sur l'icône → « Choisir le flux à envoyer… » si le choix automatique se trompe.

Choix automatique de la source : sites connus de yt-dlp (YouTube, X, Twitch…) → la page ; sinon le
dernier flux HLS/DASH vu dans l'onglet, envoyé avec le Referer, le User-Agent et les cookies du site ;
sinon le fichier vidéo ; sinon la page (extracteur générique de yt-dlp).

L'extension parle à un serveur local de l'appli (`http://127.0.0.1:47800`), qui n'écoute que la
machine et refuse les requêtes venant de pages web.

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

Par défaut : source 1080p max, modèle **C4F32 DS** et **upscale forcé**. Même quand la vidéo a déjà
la taille de la fenêtre, ArtCNN double la résolution puis l'image est ramenée à l'écran (plus nette,
moins de bruit). Désactivable dans les paramètres (« Toujours upscaler »).

mpv tourne en **Vulkan** : en Direct3D 11, compiler un modèle ArtCNN prenait plus de 5 minutes (et
tombait sur la puce AMD des portables hybrides). Au premier lancement, les 4 modèles sont préparés
derrière l'écran d'accueil (~1 à 2 min) ; le cache de shaders rend ensuite les changements rapides.

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
