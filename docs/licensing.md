# Licensing and redistribution

## Original code

The original NetsuCast code is distributed under the **GNU Affero General Public License version 3.0 only** (`AGPL-3.0-only`). The full legal text is in [`../LICENSE`](../LICENSE) (also in `LICENSES/AGPL-3.0-only.txt`). The SPDX/REUSE declaration — including the copyright holder — is centralised in [`../REUSE.toml`](../REUSE.toml).

This licence allows commercial use, copying and modification, but requires among other things that notices be kept, that modifications be published under the same licence, and that the corresponding source be provided with any binary redistribution. If a modified version lets users interact with it remotely over a network, it must also offer them free access to the corresponding source.

The reference public repository for the source is <https://github.com/NetsumaInfo/NetsuCast>.

## Scope

AGPL-3.0-only covers the original code in this repository, including the browser extension in `extension/`. It does **not** change the terms applying to third-party material:

- npm and Rust dependencies keep their own licences;
- mpv, `yt-dlp`, Deno, WebView2 and any other software shipped or used on the machine are **not** relicensed by NetsuCast;
- the ArtCNN GLSL shaders carry their own licence (`src-tauri/resources/shaders/LICENSE-ArtCNN`);
- licence files shipped next to bundled resources must stay distributed with those resources.

## Third-party programs shipped in the installer

Unlike NetsuBoard, whose installer ships none of its runtime tools, NetsuCast's installer **does** carry three third-party programs, in `<install dir>\tools\mpv\`. NetsuCast runs each as a **separate process** (no linking), so they are aggregated with NetsuCast, not combined into a derivative work — but shipping them makes this project their **distributor**, with the obligations that come with it.

| Program | Source | Licence | Licence text in the installer |
|---|---|---|---|
| **mpv** (`mpv.exe`, `mpv\fonts.conf`) | [shinchiro/mpv-winbuild-cmake](https://github.com/shinchiro/mpv-winbuild-cmake), latest release at packaging time | GPL-2.0-or-later; the build statically links FFmpeg, libplacebo, libass and others under GPL/LGPL, so the executable as a whole is distributed under the GNU GPL | `tools\mpv\licenses\GPL-2.0.txt`, `GPL-3.0.txt` |
| `d3dcompiler_43.dll` | shipped inside the same mpv archive | Microsoft DirectX redistributable | — (redistributed unmodified) |
| **yt-dlp** (`yt-dlp.exe`) | [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) official release | The Unlicense (public domain); the PyInstaller bundle embeds Python and packages under their own licences | `tools\mpv\licenses\yt-dlp-Unlicense.txt` |
| **Deno** (`deno.exe`) | [denoland/deno](https://github.com/denoland/deno) official release | MIT | `tools\mpv\licenses\deno-MIT.txt` |
| **ArtCNN** shaders | [Artoriuz/ArtCNN](https://github.com/Artoriuz/ArtCNN) | MIT | `resources\shaders\LICENSE-ArtCNN` |

`src-tauri/resources/tools/mpv/THIRD-PARTY-NOTICES.txt` summarises this inside the installation folder. `scripts/build.ps1` writes `VERSIONS.txt` beside it with the exact builds shipped (`mpv --version` names the mpv git commit and the FFmpeg version).

### The GPL obligation for mpv

Distributing a GPL binary requires giving recipients the licence text (done, above) **and** access to the **corresponding source** of that exact binary. For every release that ships mpv:

1. Attach `VERSIONS.txt` (the `netsucast-release` CI artefact contains it) to the GitHub release.
2. Make the matching source available **from the same release**: the `mpv-winbuild-cmake` source archive of the release tag the binary came from, plus the mpv source at the commit named in `VERSIONS.txt`. GitHub's "Source code" archive of `NetsumaInfo/NetsuCast` is **not** it.

   Pointing to upstream alone is weaker: upstream can delete an old build or tag, and the obligation stays with the distributor. Mirroring the source archives next to the installer, as NetsuBoard does for its ffmpeg mirror, is what keeps a release compliant for as long as it is downloadable.

This step is **not automated yet**: `install-tools.ps1` always takes the latest shinchiro build and does not record its tag. Pinning the mpv build (tag + checksum) in `install-tools.ps1` and fetching its source archives in `release.yml` is the natural next step.

Before publishing an installer with a new or updated dependency: check its licence at the source, keep its copyright notice, add its text to `src-tauri/resources/tools/mpv/licenses/` (or next to the resource), and update this file. Never present a third-party component as covered by NetsuCast's AGPL.

## Rules that keep the project redistributable

- **Never copy GPL or AGPL code from another project into the tree**, not even translated into another language. Studying a project's UX or approach and reimplementing it is fine; copying its source is not.
- **The GLSL shaders ship with the app**, so their licences ship with it too. ArtCNN is permissive (MIT), which is what makes bundling it possible; a shader under a copyleft or non-commercial licence would not be, whatever its quality.
- **Verify a licence at its source** (the repository, the release page) before adding a shader or a dependency.
- An asset re-uploaded by a third party **without a declared licence** is not usable, whatever the original's licence.

## Legal notice inside the app

NetsuCast is provided **without warranty**, per sections 15 and 16 of the AGPL. The source and the licence text are published with the project; any derived remote interface or distribution must keep visible access to that information and comply with section 13 of the AGPL.
