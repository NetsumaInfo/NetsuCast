// Shared by the service worker and the popup.

export const DEFAULT_PORT = 47800;

/** Sites yt-dlp resolves better than any intercepted request (signed or split streams). */
export const PAGE_SITES = /(^|\.)(youtube\.com|youtu\.be|x\.com|twitter\.com|twitch\.tv|vimeo\.com|dailymotion\.com|reddit\.com|tiktok\.com|instagram\.com|facebook\.com|bilibili\.com|nicovideo\.jp|streamable\.com|kick\.com)$/i;

export async function getPort() {
  const { port } = await chrome.storage.local.get("port");
  return Number(port) || DEFAULT_PORT;
}

export async function ping() {
  try {
    const res = await fetch(`http://127.0.0.1:${await getPort()}/ping`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Hands a video to the player.
 * kind "stream": `url` is the media itself (m3u8, mpd, mp4) and is played with the browser's
 *                Referer, User-Agent and cookies, which most CDNs check.
 * kind "page":   `url` is a web page that yt-dlp resolves inside the player, with the site's
 *                cookies so it runs as the signed-in user.
 * start:         position in seconds the browser was at, so playback continues there.
 */
/**
 * Cookies the site would send for `url`, looked up two ways (by URL, and by the whole domain,
 * e.g. every *.youtube.com cookie) because either can come back short depending on the page.
 * Errors are reported instead of swallowed, so the app can say why the session is missing.
 */
async function siteCookies(url) {
  const found = new Map();
  const errors = [];
  let domain = null;
  try {
    domain = new URL(url).hostname.split(".").slice(-2).join(".");
  } catch {
    // not a URL: nothing to look up
  }
  const queries = [{ url }, ...(domain ? [{ domain }] : [])];
  for (const query of queries) {
    try {
      for (const c of await chrome.cookies.getAll(query)) found.set(`${c.domain}|${c.path}|${c.name}`, c);
    } catch (e) {
      errors.push(String(e?.message ?? e));
    }
  }
  return { cookies: [...found.values()], error: errors.join(" / ") || null };
}

export async function cast({ url, kind, title, referer, start }) {
  const headers = { userAgent: navigator.userAgent };
  const { cookies, error: cookieError } = await siteCookies(url);
  let jar = [];
  if (kind === "stream") {
    if (referer) headers.referer = referer;
    if (cookies.length) headers.cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } else {
    // yt-dlp gets the site session as a cookie file: YouTube refuses anonymous requests
    // ("Sign in to confirm you are not a bot").
    jar = cookies.map(({ domain, hostOnly, path, secure, httpOnly, expirationDate, name, value }) => ({
      domain, hostOnly, path, secure, httpOnly, expirationDate, name, value,
    }));
  }
  const res = await fetch(`http://127.0.0.1:${await getPort()}/cast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      kind,
      title,
      headers,
      cookies: jar,
      start: Number.isFinite(start) ? start : null,
      // What the app shows when a site still refuses playback.
      diag: { extensionVersion: chrome.runtime.getManifest().version, cookiesFound: cookies.length, cookieError },
    }),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`NetsuCast a répondu ${res.status}`);
}

export function isPageSite(url) {
  try {
    return PAGE_SITES.test(new URL(url).hostname);
  } catch {
    return false;
  }
}
