import { cast, getPort, getPrefs, isPageSite, isVideoPage, launchApp, ping, unreachable } from "./common.js";

// Detected streams per tab, kept in session storage because the service worker is short-lived.
// Entry: { url, type: "HLS" | "DASH" | "MP4" | "WEBM", referer, at, documentId }
// documentId: the page (or iframe) that requested it.

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

    record(details.tabId, { url: details.url, type, referer, at: Date.now(), documentId: details.documentId });
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
async function pickSource(tab, { frameUrl, src, pageUrl: videoPage, documentId } = {}) {
  const pageUrl = videoPage ?? tab.url;
  if (isPageSite(pageUrl)) {
    // A feed, channel or home page is a list: yt-dlp would play its first entry.
    if (!isVideoPage(pageUrl)) throw new Error("no-video");
    return { url: pageUrl, kind: "page" };
  }

  if (src && /^https?:/i.test(src) && (FILE_URL.test(src) || PLAYLIST_URL.test(src))) {
    return { url: src, kind: "stream", referer: frameUrl ?? pageUrl };
  }

  // A player in an iframe: sites like anime-sama switch episodes by loading another iframe and
  // keep the tab's URL, so only what this player's document loaded belongs to this video, and
  // the iframe (not the tab) is the page to resolve.
  const inFrame = !!frameUrl && frameUrl !== tab.url;
  let streams = await getStreams(tab.id);
  if (inFrame && documentId) streams = streams.filter((s) => s.documentId === documentId);
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

  return { url: inFrame ? frameUrl : pageUrl, kind: "page" };
}

/** `fromPage`: the cast button was clicked, and its page opens the app's link itself. */
// What the tab's page says about the video, for the app's Discord status: read in the top frame,
// where the site's titles and episode list live (the player is often an iframe). Every site says
// it differently, so everything that can name the show is collected, best first, and the app
// (src/lib/media.ts) picks the show, season and episode out of it.
const pageMeta = () => {
  const tag = (name) => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content?.trim() || null;
  const absolute = (url) => {
    try {
      return url ? new URL(url, location.href).href : null;
    } catch {
      return null;
    }
  };
  const text = (el) => el?.textContent?.replace(/\s+/g, " ").trim() || null;

  // schema.org data (JSON-LD), the most precise when a site has it: Episode, TVSeries, Movie.
  let ld = {};
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node["@graph"]) visit(node["@graph"]);
    const type = [].concat(node["@type"] ?? []).join(" ");
    if (/Episode/i.test(type)) {
      ld.series ??= node.partOfSeries?.name ?? node.partOfTVSeries?.name;
      ld.season ??= node.partOfSeason?.seasonNumber;
      ld.episode ??= node.episodeNumber;
      ld.image ??= [].concat(node.partOfSeries?.image ?? node.image ?? [])[0];
    } else if (/TVSeries|Movie|CreativeWorkSeries/i.test(type)) {
      ld.series ??= node.name;
      ld.kind ??= /Movie/i.test(type) ? "movie" : "tv";
      ld.image ??= [].concat(node.image ?? [])[0];
    }
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      visit(JSON.parse(script.textContent));
    } catch {
      // a broken block: the others still count
    }
  }
  const image = typeof ld.image === "object" ? ld.image?.url : ld.image;

  // The episode on screen: a list (<select>) or a highlighted entry that names an episode.
  const EP = /[ée]pisode|\bep\b/i;
  const select = [...document.querySelectorAll("select")].find((s) => EP.test(`${s.id} ${s.name} ${s.className} ${s.selectedOptions[0]?.text ?? ""}`));
  const highlighted = [...document.querySelectorAll('[aria-current="true"], [aria-current="page"], [aria-selected="true"], .active, .current, .selected')]
    .map(text)
    .find((t) => t && t.length < 60 && /(?:[ée]pisode|ep\.?)\s*\d/i.test(t));

  return {
    series: ld.series ?? tag("video:series") ?? null,
    season: Number(ld.season) || null,
    episode: Number(ld.episode) || null,
    kind: ld.kind ?? (/movie/i.test(tag("og:type") ?? "") ? "movie" : /episode|tv_show/i.test(tag("og:type") ?? "") ? "tv" : null),
    // Candidates for the show's name, best first; the app strips the site's name and the noise.
    titles: [tag("og:title"), tag("twitter:title"), document.title, text(document.querySelector("h1"))].filter(Boolean),
    episodeText: select?.selectedOptions[0]?.text?.trim() || highlighted || null,
    image: absolute(image) ?? absolute(tag("og:image")) ?? absolute(tag("twitter:image")),
    site: tag("og:site_name") || location.hostname.replace(/^www\./, ""),
    url: location.href,
  };
};

async function metaOf(tabId) {
  try {
    const [top] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, func: pageMeta });
    return top?.result ?? null;
  } catch {
    return null;
  }
}

async function castTab(tab, info = {}, fromPage = false) {
  const source = await pickSource(tab, info);
  const { sendPosition } = await getPrefs();
  const request = { ...source, title: tab.title, start: sendPosition ? (info.start ?? null) : null, meta: await metaOf(tab.id) };
  try {
    await cast(request);
  } catch (error) {
    if (!unreachable(error)) throw error;
    // NetsuCast is closed: start it, then send again. The page is told, so the button says so
    // and the video pauses where it is (the position sent stays right).
    chrome.tabs.sendMessage(tab.id, { type: "launching" }).catch(() => {});
    if (!(await launchApp(tab.id, { opened: fromPage }))) throw error;
    await cast(request);
  }
}

// Both run in the content scripts' isolated world, where content.js defines the helpers.
const grabVideo = () => window.__netsucastGrab?.() ?? null;
const pauseVideos = () => window.__netsucastPause?.();

const t = (key, subs) => chrome.i18n.getMessage(key, subs);

async function flash(tabId, ok, title) {
  const { theme } = await chrome.storage.local.get("theme");
  await chrome.action.setBadgeBackgroundColor({ tabId, color: ok ? (theme?.accent || "#2F6FE0") : "#dc2626" });
  await chrome.action.setBadgeText({ tabId, text: ok ? "✓" : "!" });
  await chrome.action.setTitle({ tabId, title });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" });
    chrome.action.setTitle({ tabId, title: t("actionTitle") });
  }, ok ? 2500 : 6000);
}

// Toolbar icon (when it does not open the popup) or the shortcut (Alt+Shift+C by default, which
// casts even when the icon opens the popup): cast right away, no menu.
chrome.action.onClicked.addListener((tab) => castActive(tab));
chrome.commands.onCommand.addListener(async (name, tab) => {
  if (name !== "cast-video") return;
  castActive(tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]);
});

async function castActive(tab) {
  if (!tab) return;
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
    await castTab(tab, found ? { ...found.result, documentId: found.documentId } : {});
    await flash(tab.id, true, t("castDone"));
    if (found && (await getPrefs()).pauseOnCast) {
      chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [found.frameId] }, func: pauseVideos }).catch(() => {});
    }
  } catch (e) {
    const code = String(e?.message ?? e);
    await flash(tab.id, false, code === "no-video" ? t("errNoVideo") : t("errNotRunning"));
  }
}

// The content script asks for the app's colours when a page loads; one ping refreshes them for
// every tab (at most every 30 s).
let themeCheckedAt = 0;
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "refresh-theme" || Date.now() - themeCheckedAt < 30_000) return;
  themeCheckedAt = Date.now();
  ping();
});

// Cast button drawn over a video by content.js.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== "cast" || !sender.tab) return;
  castTab(sender.tab, { ...message, documentId: sender.documentId }, true)
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
// Menus and the toolbar icon follow the settings: "Play in NetsuCast" can be turned off, and a
// click on the icon can open the popup instead of casting at once.
let syncing = Promise.resolve();
function applyPrefs() {
  syncing = syncing.then(async () => {
    const prefs = await getPrefs();
    await chrome.action.setPopup({ popup: prefs.iconClick === "menu" ? "popup.html" : "" });
    await chrome.contextMenus.removeAll();
    if (prefs.contextMenu) chrome.contextMenus.create({ id: "netsucast-play", title: t("menuPlay"), contexts: ["page", "video", "link"] });
    chrome.contextMenus.create({ id: "netsucast-pick", title: t("menuPick"), contexts: ["action"] });
    chrome.contextMenus.create({ id: "netsucast-settings", title: t("menuSettings"), contexts: ["action"] });
  }).catch(() => {});
}
chrome.storage.onChanged.addListener((changes, area) => area === "local" && changes.prefs && applyPrefs());

chrome.runtime.onStartup.addListener(() => {
  hello();
  applyPrefs();
});

chrome.runtime.onInstalled.addListener(() => {
  hello();
  applyPrefs();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "netsucast-pick" || info.menuItemId === "netsucast-settings") {
    const view = info.menuItemId === "netsucast-settings" ? "&view=settings" : "&view=cast";
    chrome.windows.create({ url: `popup.html?tab=${tab?.id ?? ""}${view}`, type: "popup", width: 420, height: 560 });
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
