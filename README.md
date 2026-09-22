<div align="center">
  <img src="src-tauri/icons/128x128.png" alt="" width="112" height="112">

# NetsuCast

**A Windows video player that takes over a video playing in your browser and upscales it live with ArtCNN on the GPU.**

[![Licence: AGPL-3.0-only](https://img.shields.io/badge/licence-AGPL--3.0--only-blue.svg)](LICENSE)
![Platform: Windows](https://img.shields.io/badge/platform-Windows-lightgrey.svg)

</div>

Web video is often compressed hard and served below the size of the screen. NetsuCast is two parts:
a browser extension that finds the video you are watching, and a desktop player (Tauri + mpv) that
plays it with an [ArtCNN](https://github.com/Artoriuz/ArtCNN) shader upscaling every frame. The
video pauses in the browser and resumes in the player at the same second.

It does not play DRM-protected streams and does not try to: Netflix, Crunchyroll and similar
services stay in the browser.

> [!NOTE]
> Version 0.1.0, no published installer yet. Windows only.

## How a video gets to the player

| From | What happens |
|---|---|
| The **NetsuCast** button shown over any video on hover (iframes included) | Casts that video and pauses it in the page |
| The extension icon, or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> | Casts the main video of the tab |
| Right-click on the icon, *Choose the stream to cast…* | Lists the streams the extension saw in the tab |
| A link pasted on the home screen, or a file dropped on the window | Plays it directly |

The extension picks the source for you:

1. On YouTube, X, Twitch, Vimeo, Dailymotion, Reddit, TikTok, Instagram, Facebook, Bilibili,
   Niconico, Streamable and Kick, it sends the page of that video to
   [yt-dlp](https://github.com/yt-dlp/yt-dlp), with the site's cookies so the session is yours
   (YouTube refuses anonymous requests). A feed or channel page is refused instead of playing
   its first entry.
2. Elsewhere, it sends the HLS or DASH playlist it saw load for that video, or the MP4/WebM file,
   with the page's Referer, User-Agent and cookies, which most video hosts check.
3. Failing both, it sends the page and lets yt-dlp's generic extractor try.

It talks to the player over `http://127.0.0.1:47800` only. The player binds to loopback, refuses
requests carrying a web page's origin, and accepts only `http(s)` URLs, so a website cannot make
it open something.

## Upscaling

Four ArtCNN models ship with the app: **C4F16**, **C4F16 DS**, **C4F32** and **C4F32 DS** (the
DS variants also denoise and sharpen). C4F32 DS is the default.

- **Always upscale** (on by default): ArtCNN runs even when the video already fills the window;
  the ×2 picture is then scaled back to the screen, which cleans up compression.
- **Scale**: *Auto* stacks a second pass when the screen is still at least 1.3× bigger than the
  ×2 result (540p in 4K full screen becomes ×4); *×2 only* keeps one pass.
- The **Details** panel (<kbd>I</kbd>) shows what the GPU actually ran, read from mpv's render
  pass statistics: source, codec, bitrate, buffer, the ArtCNN factor, its cost in ms per frame,
  the frame budget and dropped frames.

mpv renders through Vulkan. Direct3D 11 took several minutes to compile one ArtCNN model and
could land on the integrated GPU of a hybrid laptop; Vulkan picks the discrete GPU and compiles in
seconds. The first launch still prepares each model once behind the home screen, and mpv's shader
cache keeps the result.

## Player

| Key | Action |
|---|---|
| <kbd>Space</kbd> / <kbd>K</kbd> | Play / pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Back / forward 5 s |
| <kbd>J</kbd> / <kbd>L</kbd> | Back / forward by the skip setting (10 s by default) |
| <kbd>↑</kbd> / <kbd>↓</kbd>, mouse wheel | Volume |
| <kbd>M</kbd> | Mute |
| <kbd>F</kbd>, double-click | Full screen (<kbd>Esc</kbd> leaves it) |
| <kbd>C</kbd> | Next subtitle track |
| <kbd>U</kbd> | Next upscale model |
| <kbd>I</kbd> | Details panel |
| <kbd>Shift</kbd>+<kbd>I</kbd> | mpv statistics overlay |
| <kbd>H</kbd> | Back to the home screen |

The control bar also has subtitle and audio track menus, source quality (best, 4K down to 480p,
for yt-dlp sources) and speed from 0.5× to 2×.

<details>
<summary>Every setting</summary>

| Section | Settings |
|---|---|
| Playback | Skip length (5, 10, 15, 30 s) · resume at the browser's position · full screen on every cast · keep the window on top · decode with the graphics card |
| Upscale | Default model · always upscale · scale · maximum source quality · smooth gradients (debanding) |
| Subtitles and audio | Subtitle languages · YouTube's automatic subtitles · subtitle size · preferred audio languages |
| Interface | Language, or the system's |
| Advanced | Extension port · mpv and yt-dlp paths · update yt-dlp · prepare the models again |

</details>

The interface and the extension are translated into 17 languages: French (source), English,
Spanish, German, Italian, Brazilian Portuguese, Dutch, Polish, Russian, Ukrainian, Turkish,
Japanese, Korean, Simplified and Traditional Chinese, Arabic and Hebrew. Arabic and Hebrew
render right to left, except the seek bar and times.

## Installing the extension

Chromium browsers only: Chrome, Edge, Brave, Opera, Opera GX, Vivaldi and Chromium. Firefox is
listed but not supported, since it installs signed add-ons only.

The home screen has an **Install the extension** button. It opens the chosen browser's extensions
page and copies the folder path; three clicks remain (developer mode, *Load unpacked*, paste the
path), because browsers do not let an extension install itself. The player notices when the
extension is in.

## Building from source

Needs Windows 10 or 11, Node 22, pnpm 9 and Rust stable with the MSVC toolchain.

```bash
pnpm install
pnpm tools        # downloads mpv, yt-dlp and Deno into tools/mpv/
pnpm tauri dev
```

`run.bat` wraps the same steps in a menu, with Git helpers. `pnpm package` builds the NSIS
installer with mpv, yt-dlp and Deno inside; [docs/releasing.md](docs/releasing.md) covers
versioning, updater signing and the release workflow, and
[docs/code-signing.md](docs/code-signing.md) the Authenticode side.

`pnpm check:i18n` checks that every language has exactly the keys of the French source. UI and
text changes follow [DESIGN.md](DESIGN.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). Security
issues: [SECURITY.md](SECURITY.md).

## Licence

[AGPL-3.0-only](LICENSE). The installer also ships mpv (GPL), yt-dlp (Unlicense), Deno (MIT) and
the ArtCNN shaders (MIT); details in [docs/licensing.md](docs/licensing.md).
