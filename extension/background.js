import { cast, getPort, isPageSite, isVideoPage } from "./common.js";

// Detected streams per tab, kept in session storage because the service worker is short-lived.
// Entry: { url, type: "HLS" | "DASH" | "MP4" | "WEBM", referer, at }

const MAX_PER_TAB = 30;
const FILE_URL = /\.(mp4|webm|m4v|mov|mkv)(\?|#|$)/i;
const PLAYLIST_URL = /\.(m3u8|mpd)(\?|#|$)/i;
// Segments of an HLS/DASH stream: useless alone, the playlist is what matters.
const SEGMENT_URL = /\.(ts|m4s|aac|m4a|vtt|webvtt)(\?|#|$)|\/(init|seg|segment|chunk|frag)[-_]?\d/i;
// YouTube serves split, signed streams that only yt-dlp can replay: the page URL is used instead.
const IGNORED_HOSTS = /(^|\.)(googlevideo\.com|doubleclick\.net|googlesyndication\.com)$/i;
// Playlists of one video arrive together (master, then variants): anything older belongs to an
// earlier video of the same page.
const SAME_VIDEO_WINDOW_MS = 15_000;

const referers = new Map(); // requestId -> Referer header, filled before the response arrives

const key = (tabId) => `tab:${tabId}`;

async function getStreams(tabId) {
  const stored = await chrome.storage.session.get(key(tabId));
  return stored[key(tabId)] ?? [];
}

async function setStreams(tabId, streams) {
  await chrome.storage.session.set({ [key(tabId)]: streams });
}

function typeOf(url, contentType, requestType) {
  const ct = (contentType ?? "").toLowerCase();
  if (/mpegurl/.test(ct) || /\.m3u8(\?|#|$)/i.test(url)) return "HLS";
  if (/dash\+xml/.test(ct) || /\.mpd(\?|#|$)/i.test(url)) return "DASH";
  if (SEGMENT_URL.test(url) || /mp2t|iso\.segment/.test(ct)) return null;
  // Progressive files only when the page's <video> loads them directly (not MSE chunks via XHR).
  if (requestType === "media" && (ct.startsWith("video/") || FILE_URL.test(url))) {
    return /webm/.test(ct) || /\.webm/i.test(url) ? "WEBM" : "MP4";
  }
  return null;
}

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const referer = details.requestHeaders?.find((h) => h.name.toLowerCase() === "referer")?.value;
    if (referer) referers.set(details.requestId, referer);
  },
  { urls: ["<all_urls>"], types: ["xmlhttprequest", "media", "other"] },
  ["requestHeaders", "extraHeaders"],
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const referer = referers.get(details.requestId);
    referers.delete(details.requestId);
    if (details.tabId < 0 || details.statusCode >= 400) return;

    let host;
    try {
      host = new URL(details.url).hostname;
    } catch {
      return;
    }
    if (IGNORED_HOSTS.test(host)) return;

    const contentType = details.responseHeaders?.find((h) => h.name.toLowerCase() === "content-type")?.value;
    const type = typeOf(details.url, contentType, details.type);
    if (!type) return;

    record(details.tabId, { url: details.url, type, referer, at: Date.now() });
  },
  { urls: ["<all_urls>"], types: ["xmlhttprequest", "media", "other"] },
  ["responseHeaders"],
);

// Writes are serialized per tab: a player fires several playlist requests at once.
const queues = new Map();
function record(tabId, entry) {
  const run = (queues.get(tabId) ?? Promise.resolve()).then(async () => {
    const streams = await getStreams(tabId);
    if (streams.some((s) => s.url === entry.url)) return;
    streams.push(entry);
    await setStreams(tabId, streams.slice(-MAX_PER_TAB));
  });
  queues.set(tabId, run.catch(() => {}));
}

// A new page in the tab starts a fresh list.
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId >= 0) setStreams(details.tabId, []);
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
);

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(key(tabId)));

// --- choosing what to send ---------------------------------------------------------------------

/**
 * Best source for the video playing in `tab`:
 * 1. sites yt-dlp knows (YouTube, X…) → the page, for the best quality and subtitles;
 * 2. an HLS/DASH playlist seen in the tab → the master of the latest video;
 * 3. a progressive file the <video> loaded directly;
 * 4. otherwise the page, and yt-dlp's generic extractor tries its luck.
 */
async function pickSource(tab, { frameUrl, src, pageUrl: videoPage } = {}) {
  const pageUrl = videoPage ?? tab.url;
  if (isPageSite(pageUrl)) {
    // A feed, channel or home page is a list: yt-dlp would play its first entry.
    if (!isVideoPage(pageUrl)) throw new Error("no-video");
    return { url: pageUrl, kind: "page" };
  }

  if (src && /^https?:/i.test(src) && (FILE_URL.test(src) || PLAYLIST_URL.test(src))) {
    return { url: src, kind: "stream", referer: frameUrl ?? pageUrl };
  }

  const streams = await getStreams(tab.id);
  const playlists = streams.filter((s) => s.type === "HLS" || s.type === "DASH");
  if (playlists.length) {
    const latest = playlists[playlists.length - 1].at;
    const group = playlists.filter((s) => latest - s.at <= SAME_VIDEO_WINDOW_MS);
    const master = group.find((s) => /master|playlist|index\.m3u8/i.test(s.url)) ?? group[0];
    return { url: master.url, kind: "stream", referer: master.referer ?? frameUrl ?? pageUrl };
  }

  const files = streams.filter((s) => s.type === "MP4" || s.type === "WEBM");
  if (files.length) {
    const file = files[files.length - 1];
    return { url: file.url, kind: "stream", referer: file.referer ?? frameUrl ?? pageUrl };
  }

  return { url: pageUrl, kind: "page" };
}

async function castTab(tab, info = {}) {
  const source = await pickSource(tab, info);
  await cast({ ...source, title: tab.title, start: info.start ?? null });
}

// Both run in the content scripts' isolated world, where content.js defines the helpers.
const grabVideo = () => window.__netsucastGrab?.() ?? null;
const pauseVideos = () => window.__netsucastPause?.();

const t = (key, subs) => chrome.i18n.getMessage(key, subs);

async function flash(tabId, ok, title) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: ok ? "#2F6FE0" : "#dc2626" });
  await chrome.action.setBadgeText({ tabId, text: ok ? "✓" : "!" });
  await chrome.action.setTitle({ tabId, title });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" });
    chrome.action.setTitle({ tabId, title: t("actionTitle") });
  }, ok ? 2500 : 6000);
}

// Toolbar icon or Alt+Shift+C: cast right away, no menu.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https?:/i.test(tab.url ?? "")) return;
  let found = null;
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: grabVideo });
    found = results
      .filter((r) => r.result)
      .sort((a, b) => Number(b.result.playing) - Number(a.result.playing) || b.result.area - a.result.area)[0];
  } catch {
    // restricted page: fall back to the page URL
  }
  try {
    await castTab(tab, found?.result ?? {});
    await flash(tab.id, true, t("castDone"));
    if (found) {
      chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [found.frameId] }, func: pauseVideos }).catch(() => {});
    }
  } catch (e) {
    const code = String(e?.message ?? e);
    await flash(tab.id, false, code === "no-video" ? t("errNoVideo") : t("errNotRunning"));
  }
});

// Cast button drawn over a video by content.js.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== "cast" || !sender.tab) return;
  castTab(sender.tab, message)
    .then(() => reply({ ok: true }))
    .catch((e) => reply({ ok: false, error: String(e?.message ?? e) }));
  return true;
});

// --- context menus -----------------------------------------------------------------------------

// Tells the app the extension is here (it then hides its install guide). Silent if the app is closed.
async function hello() {
  try {
    await fetch(`http://127.0.0.1:${await getPort()}/hello`, { method: "POST", signal: AbortSignal.timeout(1500) });
  } catch {
    // app not running
  }
}
chrome.runtime.onStartup.addListener(hello);

chrome.runtime.onInstalled.addListener(() => {
  hello();
  chrome.contextMenus.create({ id: "netsucast-play", title: t("menuPlay"), contexts: ["page", "video", "link"] });
  chrome.contextMenus.create({ id: "netsucast-pick", title: t("menuPick"), contexts: ["action"] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "netsucast-pick") {
    chrome.windows.create({ url: `popup.html?tab=${tab?.id ?? ""}`, type: "popup", width: 420, height: 560 });
    return;
  }
  if (!tab) return;
  try {
    if (info.linkUrl) {
      const kind = PLAYLIST_URL.test(info.linkUrl) || FILE_URL.test(info.linkUrl) ? "stream" : "page";
      await cast({ url: info.linkUrl, kind, referer: info.pageUrl, title: tab.title });
    } else {
      await castTab(tab, { src: info.srcUrl, frameUrl: info.frameUrl });
    }
    await flash(tab.id, true, t("castDone"));
  } catch {
    await flash(tab.id, false, t("errNotRunning"));
  }
});
