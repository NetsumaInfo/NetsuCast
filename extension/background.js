import { cast, isPageSite } from "./common.js";

// Detected streams per tab, kept in session storage because the service worker is short-lived.
// Entry: { url, type: "HLS" | "DASH" | "MP4" | "WEBM", referer, at }

const MAX_PER_TAB = 30;
const PLAYLIST_URL = /\.(m3u8|mpd)(\?|#|$)/i;
const FILE_URL = /\.(mp4|webm|m4v|mov|mkv)(\?|#|$)/i;
// Segments of an HLS/DASH stream: useless alone, the playlist is what matters.
const SEGMENT_URL = /\.(ts|m4s|aac|m4a|vtt|webvtt)(\?|#|$)|\/(init|seg|segment|chunk|frag)[-_]?\d/i;
// YouTube serves split, signed streams that only yt-dlp can replay: the page URL is used instead.
const IGNORED_HOSTS = /(^|\.)(googlevideo\.com|doubleclick\.net|googlesyndication\.com)$/i;

const referers = new Map(); // requestId -> Referer header, filled before the response arrives

const key = (tabId) => `tab:${tabId}`;

async function getStreams(tabId) {
  const stored = await chrome.storage.session.get(key(tabId));
  return stored[key(tabId)] ?? [];
}

async function setStreams(tabId, streams) {
  await chrome.storage.session.set({ [key(tabId)]: streams });
  await chrome.action.setBadgeText({ tabId, text: streams.length ? String(streams.length) : "" });
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

// --- context menu ------------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "netsucast-play",
    title: "Lire dans NetsuCast",
    contexts: ["page", "video", "link"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const title = tab?.title;
  let request;
  if (info.srcUrl && /^https?:/i.test(info.srcUrl)) {
    request = { url: info.srcUrl, kind: "stream", referer: info.pageUrl };
  } else if (info.linkUrl) {
    request = { url: info.linkUrl, kind: PLAYLIST_URL.test(info.linkUrl) || FILE_URL.test(info.linkUrl) ? "stream" : "page", referer: info.pageUrl };
  } else {
    // A <video> fed by MSE has a blob: source; the best bet is then the detected playlist, or
    // the page itself for sites yt-dlp knows.
    const streams = tab ? await getStreams(tab.id) : [];
    const best = !isPageSite(info.pageUrl) && streams.find((s) => s.type === "HLS" || s.type === "DASH");
    request = best ? { url: best.url, kind: "stream", referer: best.referer ?? info.pageUrl } : { url: info.pageUrl, kind: "page" };
  }
  try {
    await cast({ ...request, title });
  } catch {
    if (tab) chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
  }
});
