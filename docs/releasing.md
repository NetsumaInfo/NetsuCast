# Publishing a release

The NetsuCast updater reads `latest.json` from the latest release of the `NetsumaInfo/NetsuCast` GitHub repository (`plugins.updater.endpoints` in `src-tauri/tauri.conf.json`). Installers are signed: the app refuses an unsigned update.

The signature below is the **updater's**, and Windows never sees it. Authenticode signing, SmartScreen reputation and Defender false positives are a separate axis, covered in [`code-signing.md`](code-signing.md).

## Signing key

Each application has its **own** key pair. NetsuCast's was generated for NetsuCast and is distinct from NetsuBoard's and NetsuRush's; never point this build at another app's key, and never reuse this one elsewhere.

| File | Where | Shared? |
|---|---|---|
| Private key | `%USERPROFILE%\.tauri\netsucast.key` — **outside the repository** | Never. Only as the `TAURI_SIGNING_PRIVATE_KEY` repository secret. |
| Public key | `%USERPROFILE%\.tauri\netsucast.key.pub`, copied into `plugins.updater.pubkey` of `src-tauri/tauri.conf.json` | Yes |

The pair carries **no password**. Adding one later means setting `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` everywhere the installer is built.

**Back the private key up outside this machine before the first release** (password manager, encrypted backup). Losing it means existing installs can never accept a future update. Changing the key after a release is not possible without breaking every existing install — an installed app only accepts updates signed by the public key it shipped with.

To use the key in CI, add the **contents** of `netsucast.key` (one base64 line) as the repository secret `TAURI_SIGNING_PRIVATE_KEY`: GitHub → Settings → Secrets and variables → Actions → New repository secret.

`scripts/build.ps1` loads `%USERPROFILE%\.tauri\netsucast.key` by itself when `TAURI_SIGNING_PRIVATE_KEY` is not set. It also guarantees an **empty** `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` for `tauri build`. That variable is not optional even though the pair has no password: without it the CLI waits for a password on stdin — even with `CI=true` — so the build hangs after the installer is written (the `.exe` is there, the `.sig` never comes). Windows PowerShell 5.1 cannot hold an empty environment variable (`$env:X = ''` deletes it), which is why `build.ps1` starts `tauri build` through `ProcessStartInfo`, whose environment block keeps the empty value. Signing by hand, use Git Bash (`export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=''`) or PowerShell 7.

## Versions

The version lives in three files and they must match — `build.ps1` refuses to build otherwise:

- `package.json`
- `src-tauri/Cargo.toml` (then `cargo check` to refresh `Cargo.lock`)
- `src-tauri/tauri.conf.json`

Bump **one patch at a time** (`0.1.0` → `0.1.1` → `0.1.2`…). Never skip versions.

Each version also gets an entry at the top of `src/data/releases.json` (`id` and `version` = the new version, a date, a `title` and `changes` in `fr` and `en`, each change a `feature`, `improvement`, `performance` or `fix`). The app shows it once after the update (*What's new*) and in Settings ▸ Updates, and the updater manifest uses it as release notes.

The updater downloads `latest.json` and the installer from the GitHub release without credentials: while the repository is private, installed copies cannot see updates.

## Release from a development machine

```powershell
pnpm package            # install-tools -> stage tools -> tauri build (installer + .sig)
pnpm update:manifest    # latest.json beside the installer
```

`pnpm package` also works on a clean checkout: it runs `scripts/install-tools.ps1` first, so `tools/mpv/` is downloaded if missing (and yt-dlp updated). Set `NETSUCAST_SIGN_COMMAND` in the same session to also Authenticode-sign the build; without it `build.ps1` warns and ships an unsigned installer. See [`code-signing.md`](code-signing.md).

Then, by hand:

1. Create the `v<version>` tag and a GitHub release for it. Attach from `src-tauri/target/release/bundle/nsis/`: the `NetsuCast_<version>_x64-setup.exe` installer, its `.exe.sig`, and `latest.json`.
2. Publish the installer's SHA-256 in the release notes:

   ```powershell
   (Get-FileHash .\src-tauri\target\release\bundle\nsis\NetsuCast_*_x64-setup.exe -Algorithm SHA256).Hash
   ```

3. Attach `src-tauri/resources/tools/mpv/VERSIONS.txt` and honour the GPL source offer for the mpv build inside the installer — see [`licensing.md`](licensing.md).
4. Upload the installer to VirusTotal. If Defender is the only engine flagging it, submit it at [microsoft.com/wdsi/filesubmission](https://www.microsoft.com/en-us/wdsi/filesubmission) as **"Software developer – false positive"** and link the VirusTotal report in the release notes. If several engines agree, do not publish — investigate the build.

Steps 2 and 4 stay part of every release until the signing certificate has accumulated SmartScreen reputation; the rationale and the escalation path are in [`code-signing.md`](code-signing.md).

The release **must be published (not draft, not pre-release)**: the endpoint is `releases/latest/download/latest.json`, which GitHub resolves to the newest published full release only.

## Release from CI

Once SignPath signs the builds, packaging **must** happen on a runner: the Foundation attests that the binary came from this public repository, which a local build cannot demonstrate. `.github/workflows/release.yml` (manual `workflow_dispatch`, `windows-latest`) builds the installer, has it signed when SignPath is configured, regenerates the updater signature over the signed file, writes `latest.json`, computes the SHA-256 and uploads everything as the `netsucast-release` artefact.

1. Bump the version (three files), commit, push.
2. Push the tag: `git tag v<version>` then `git push origin v<version>`.
3. GitHub → Actions → **Release** → *Run workflow*, on the tag. From a tag, the workflow checks that the tag equals `v<version>`.
4. Download the `netsucast-release` artefact and attach its contents to the GitHub release (steps 1–4 above). The workflow never creates or publishes the release itself.

Repository settings the workflow reads:

| Kind | Name | Needed |
|---|---|---|
| Secret | `TAURI_SIGNING_PRIVATE_KEY` | Always (contents of `netsucast.key`) |
| Secret | `SIGNPATH_API_TOKEN` | Once SignPath is set up |
| Variable | `SIGNPATH_ORGANIZATION_ID` | Once SignPath is set up (its presence turns the signing step on) |
| Variable | `SIGNPATH_PROJECT_SLUG` | Once SignPath is set up |
| Variable | `SIGNPATH_SIGNING_POLICY_SLUG` | Once SignPath is set up |

`GITHUB_TOKEN` is provided by Actions; the workflow only uses it to lift the GitHub API rate limit when `install-tools.ps1` looks up the latest mpv build.

## What the installer contains

NSIS, per-user install (`installMode: currentUser`, `%LOCALAPPDATA%\NetsuCast` by default), French and English installer UI (`src-tauri/windows/*.nsh`). On Windows Tauri installs resources **next to the executable** under their target path, so:

| In the repository | In the installation folder |
|---|---|
| `src-tauri/resources/shaders/` (ArtCNN) | `resources\shaders\` |
| `src-tauri/resources/scripts/` (mpv helper) | `resources\scripts\` |
| `extension/` | `extension\` |
| `src-tauri/resources/tools/mpv/` (staged by `build.ps1`) | `tools\mpv\` — the first folder `src-tauri/src/tools.rs` searches |
| `LICENSE` | `LICENSE` |

`build.ps1` stages a **closed list** from `tools/mpv/`: `mpv.exe`, `d3dcompiler_43.dll`, `mpv\fonts.conf`, `yt-dlp.exe`, `deno.exe`, plus a generated `VERSIONS.txt`. The rest of the upstream mpv archive (`installer\`, `updater.bat`, `mpv-register.bat`, `doc\`, `mpv.com`) is left out on purpose: none of it is used, and a bundled script that downloads and replaces executables is the dropper shape Defender scores. The tracked `THIRD-PARTY-NOTICES.txt` and `licenses\` in that folder always ship with the tools.

Rule for every new runtime dependency (binary, DLL, script, asset), in the same change: add it to the staging list in `build.ps1` (or to `bundle.resources`), to `install-tools.ps1` when it is downloaded, and its licence to `licensing.md` and `THIRD-PARTY-NOTICES.txt`. A check that passes in dev never proves the installer is complete: before publishing, install the built setup on a clean profile and play a video.

## Updater manifest

`scripts/create-update-manifest.mjs` (`pnpm update:manifest`) finds `NetsuCast_<version>_*-setup.exe` and its `.sig` in the NSIS output folder and writes `latest.json`. The `platforms.windows-x86_64.signature` field holds the signature **contents**, not a link to the `.sig` file. The download URL always uses the `v<version>` tag.

Release notes, first match wins: `--notes-file <file>`, then the entry for the version in `src/data/releases.json` (French lines), then `NetsuCast <version>`. `--dry-run` prints the manifest without needing a build.
