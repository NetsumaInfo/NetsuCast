# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a security flaw.**

Use one of these two private channels instead:

- the **Security ▸ Report a vulnerability** tab of the GitHub repository (*private vulnerability
  reporting*);
- a private message to the maintainer from the [NetsumaInfo GitHub profile](https://github.com/NetsumaInfo).

A useful report states what is affected, how to reproduce it, the impact you estimate, and your
NetsuCast, browser and Windows versions.

Expect a few days for a first reply. The fix ships before the detailed description of the flaw, and
you are credited if you want to be.

## Scope

NetsuCast is a desktop application running on the user's machine, plus a browser extension. The
areas that matter most:

- the **cast receiver** (`src-tauri/src/receiver.rs`, HTTP on `127.0.0.1`, port 47800 by default):
  it only binds the loopback interface and only accepts extension origins (`chrome-extension://`,
  `moz-extension://`) or no origin at all. A web page able to push a URL, headers or cookies into
  the player is in scope;
- the **browser extension** (`extension/`): what it reads from pages (stream URLs, the site's
  cookies, Referer and User-Agent) and what it forwards to the receiver;
- **URLs and headers handed to mpv and `yt-dlp`**: option injection through a crafted URL, title or
  header value;
- the **mpv helper script** (`src-tauri/resources/scripts/netsucast.lua`);
- the **updater**: `latest.json` from the GitHub releases, verified against the minisign public key
  in `src-tauri/tauri.conf.json`.

**Out of scope**:

- vulnerabilities in mpv, FFmpeg, `yt-dlp`, Deno or any upstream dependency — report those to their
  vendor;
- anything requiring physical or administrator access already obtained on the machine;
- DRM-protected services: NetsuCast does not support them and never circumvents DRM.

## Supported versions

Only the latest published release receives security fixes. NetsuCast is in early development:
earlier versions are not maintained.

## Secrets

No secret belongs in the repository. The updater's private signing key lives outside the checkout
(`%USERPROFILE%\.tauri\netsucast.key`) and in the `TAURI_SIGNING_PRIVATE_KEY` repository secret
only; the public key in `tauri.conf.json` is meant to be public. Site cookies forwarded by the
extension are passed to `yt-dlp` for the cast in progress and must never be logged, persisted or
sent anywhere else.

If you find an exposed secret in the history, report it privately rather than opening an issue.
