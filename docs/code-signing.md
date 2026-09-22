# Code signing and Windows reputation

Two unrelated signatures exist in this project and they are constantly confused.

| | Updater signature | Authenticode signature |
|---|---|---|
| Key | `%USERPROFILE%\.tauri\netsucast.key` (minisign) | A code signing certificate from a CA |
| Checked by | The Tauri updater, inside the app | Windows, SmartScreen, Defender, Smart App Control |
| Covered by | [`releasing.md`](releasing.md) | This document |

An unsigned release is refused **by the updater**; it is accepted by Windows, which merely distrusts it. Publishing an updater-signed installer does nothing for SmartScreen.

## One publisher across the Netsuma apps

NetsuCast carries the same publisher identity as NetsuBoard and the other Netsuma applications, so Windows and users see one consistent creator:

| Field | Value | Where |
|---|---|---|
| `bundle.publisher` | `Haim Faraj` | `src-tauri/tauri.conf.json` |
| `bundle.copyright` | `© 2026 Haim Faraj — AGPL-3.0-only` | `src-tauri/tauri.conf.json` |
| Authorship (`author`, `authors`) | `Netsuma` | `package.json`, `src-tauri/Cargo.toml` |

Reputation is keyed on the **certificate**, so the same certificate should sign every Netsuma app: a release of one then benefits from the reputation the others earned.

> [!WARNING]
> `publisher` and `copyright` are deliberately the certificate holder's legal name, not the
> `Netsuma` pseudonym used for authorship. Do not "align" them. Windows rejects a signature whose
> subject does not match, and the copyright notice carries the same legal name on purpose. If a
> legal entity is registered for Azure Artifact Signing, its name replaces `Haim Faraj` in both
> places at once — in every Netsuma app.

## What signing does and does not buy

Signing does **not** remove the SmartScreen prompt on release day. Microsoft removed the EV instant-bypass in 2024, so OV, EV and Artifact Signing all build reputation the same way: organically, through download volume, over weeks. There is no submission form for consumer SmartScreen reputation and no way to buy it.

What it does buy, and why it is still the single highest-value change:

- **Reputation accumulates on the certificate, not only on the file hash.** Unsigned, every release starts from zero and the warning never stops. Signed with a stable certificate, each release inherits what the previous ones earned.
- The prompt names a **verified publisher** instead of an unknown one.
- Defender's machine-learning classifiers weight "unsigned" heavily. Signing is what moves `Trojan:Script/Wacatac.B!ml`-class false positives off this installer.
- Windows 11 **Smart App Control** blocks unsigned executables outright, regardless of SmartScreen.

## Choosing a certificate

| Option | Cost | Available to | Notes |
|---|---|---|---|
| **SignPath Foundation** | Free | OSI-licensed open source | Best fit on paper: this repository is public and AGPL-3.0-only. Requires a **verifiable CI build** (SignPath attests the binary came from the public source), MFA, a manual approval per release, and a published "Code signing policy" page. Disqualifying condition: **any commercial dual-licensing**. |
| **Azure Artifact Signing** (ex-Trusted Signing) | ~$9.99/month | Organizations in the US, Canada, EU, UK, AU, NZ, JP, KR, SG, CH, NO, IL. **Individuals: US and Canada only.** | Microsoft's recommended non-Store path. No hardware token, integrates with CI. From France it needs a **registered legal entity** (business identifier, business address, owned domain). Validation takes 1–20 business days. |
| **OV certificate** | $150–300/year | Worldwide, individuals included | The fallback when the two above are closed. Since June 2023 the private key must live on an HSM or USB token (cloud HSM options exist for CI). |
| **EV certificate** | $400+/year | Worldwide | No SmartScreen advantage over OV since 2024. Not worth the premium here. |

Two rules that outlive the choice:

- **Never change certificate once reputation has started building.** Reputation is keyed on the certificate thumbprint; a renewal with a new thumbprint resets it to zero.
- **Sign after staging, never before.** `scripts/build.ps1` stages the tools into `src-tauri/resources/tools/mpv/` before `tauri build`. Modifying a file after it is signed breaks its signature.

## Two wiring shapes, and the trap between them

Where the signature happens decides whether the updater still works.

- **In-build** (Azure Artifact Signing, `signtool`): Tauri runs the signing tool on each binary *during* bundling, then computes the updater's minisign signature over the already-signed installer. Nothing else to do.
- **Post-build** (SignPath): the finished `.exe` is submitted, signed and returned. Authenticode **rewrites the bytes**, so the `.sig` that `tauri build` wrote over the unsigned file no longer matches. Left alone, every installed copy would refuse the update, because `create-update-manifest.mjs` reads that stale `.sig` off disk and copies it into `latest.json`.

  The signature must therefore be regenerated on the signed installer, **before** the manifest is built (Git Bash, so the empty password variable survives):

  ```bash
  export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/netsucast.key)"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=''
  pnpm tauri signer sign <path-to-signed-setup.exe>
  ```

  `.github/workflows/release.yml` does this in order: build → SignPath → re-sign → manifest.

## SignPath, in practice

`.github/workflows/release.yml` builds the installer on a runner and submits it. The SignPath step is skipped while `vars.SIGNPATH_ORGANIZATION_ID` is unset, so the workflow is usable before the application is accepted — it then produces an unsigned installer, exactly like a local `pnpm package`.

To turn it on, set these on the repository:

| Kind | Name |
|---|---|
| Secret | `SIGNPATH_API_TOKEN` |
| Secret | `TAURI_SIGNING_PRIVATE_KEY` (contents of `%USERPROFILE%\.tauri\netsucast.key`) |
| Variable | `SIGNPATH_ORGANIZATION_ID` |
| Variable | `SIGNPATH_PROJECT_SLUG` |
| Variable | `SIGNPATH_SIGNING_POLICY_SLUG` |

The Foundation also requires, on the project side: MFA on GitHub and on SignPath, defined Author / Reviewer / Approver roles with every external contribution reviewed, a manual approval for each release, product name and version metadata on the signed binaries (`bundle.publisher`, `bundle.copyright` and `version` in `tauri.conf.json`), and a public **"Code signing policy"** page naming the team, the privacy policy and the SignPath Foundation attribution.

SignPath signs **only NetsuCast's own installer**. The third-party programs inside it (`mpv.exe`, `yt-dlp.exe`, `deno.exe`) are not ours and should not be re-signed with the project certificate: signing them would vouch, under the Netsuma identity, for binaries this project does not build. With the in-build shape below, check the first signed build's log for which files Tauri passed to the sign command.

Eligibility is lost the day any part of the project gains a commercial dual licence. Selling AGPL-3.0-only binaries does not: the disqualifying condition is offering an alternative proprietary licence.

## Wiring a signing tool into the build

For the in-build shape, signing is opt-in through the `NETSUCAST_SIGN_COMMAND` environment variable. `scripts/build.ps1` reads it, writes a `--config` overlay (`src-tauri/tauri.sign.conf.json`, git-ignored) carrying `bundle.windows.signCommand`, and passes it to `tauri build`. Tauri then runs the command once per binary of the package, with `%1` replaced by the file path.

A permanent `signCommand` is deliberately **not** committed to `tauri.conf.json`: it would break every build on a machine without the signing tool installed.

With Azure Artifact Signing (`cargo install trusted-signing-cli`, endpoint `neu` = North Europe):

```powershell
$env:AZURE_TENANT_ID = '...'
$env:AZURE_CLIENT_ID = '...'
$env:AZURE_CLIENT_SECRET = '...'
$env:NETSUCAST_SIGN_COMMAND = 'trusted-signing-cli -e https://neu.codesigning.azure.net -a <account> -c <profile> -d NetsuCast %1'
pnpm package
```

With a certificate on a token or in a store, any tool accepting a file path works the same way, for example `signtool sign /fd SHA256 /sha1 <thumbprint> /tr <timestamp-url> /td SHA256 %1`.

Without the variable the build prints a warning and produces an unsigned installer. That still ships; it just carries no reputation.

## What the installer must not do

Defender's `!ml` verdicts are classifier output, not signature matches, and an installer earns them by *looking* like a dropper. The expensive patterns, and where NetsuCast stands:

- **A script dropped into `%TEMP%` and relaunched through `powershell.exe -ExecutionPolicy Bypass`.** Absent. `src-tauri/windows/installer-hooks.nsh` uses plain NSIS operations only. The string would sit in clear text inside the compiled installer and be scanned at **install** time even if the code only ran on uninstall.
- **Bundled scripts that download and replace executables.** The upstream mpv archive carries `installer\updater.ps1` and `updater.bat`; `build.ps1` stages a closed list of files and leaves them out, together with `mpv-install.bat` / `mpv-register.bat` (file associations the app never uses).
- **Downloading executable payloads after install.** Avoided: unlike NetsuBoard, which provisions ffmpeg and `yt-dlp` on first run, NetsuCast ships mpv, yt-dlp and deno **inside** the installer. The app downloads no executable itself.

One pattern in `NSIS_HOOK_PREINSTALL` looks adjacent to that list and is deliberately kept, as in NetsuBoard: when `$INSTDIR` is not writable, the hook re-runs **itself** — `$EXEPATH`, not a dropped file — through `ExecShell "runas"`, after a dialog the user has to accept, and passes `/NCELEVATED` so it can never ask twice.

## What the running app must not do

Defender also scores the **process tree**. Here it is `NetsuCast.exe` → `tools\mpv\mpv.exe` → `yt-dlp.exe` → `deno.exe`. Every link is legitimate and none can be removed:

- `yt-dlp.exe` is a PyInstaller bundle and a long-standing `Wacatac.B!ml` false positive upstream. It is shipped unmodified from the official release.
- **Settings › update yt-dlp** runs `yt-dlp -U`, and yt-dlp replaces its own binary in `tools\mpv\`. The shape stays deliberate — the application downloads nothing itself and writes no executable; it calls a tool's own documented update command, at the user's explicit request, on the file that tool already owns. A hand-rolled download-and-overwrite of a `.exe` would be the dropper pattern proper.
- No PowerShell is spawned at runtime. `scripts/install-tools.ps1` is a development and packaging script; it is not in the installer.

## When a release is flagged anyway

1. Upload the installer to **VirusTotal** first. If Defender is the only engine flagging it, it is a machine-learning false positive and the rest of this list applies. If several engines agree, stop and investigate the build instead.
2. Submit it at [microsoft.com/wdsi/filesubmission](https://www.microsoft.com/en-us/wdsi/filesubmission), category **"Software developer – false positive"**, signed in so the verdict is trackable. Attach the VirusTotal link and the GitHub release URL.
3. If a shipped version stays blocked, escalate at [msrc.microsoft.com/report](https://msrc.microsoft.com/report).
4. Publish the installer's SHA-256 on the release page so testers can verify what they downloaded.

Steps 1, 2 and 4 belong to every release until reputation is established — see the checklist in [`releasing.md`](releasing.md).

Never tell a tester to add a Defender exclusion. It trains them to disable protection for an unknown binary, and it hides the problem instead of fixing it.
