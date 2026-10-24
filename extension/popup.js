import { cast, getPrefs, launchApp, openAppLink, ping, unreachable } from "./common.js";
import { mountSettings } from "./settings.js";

const $ = (id) => document.getElementById(id);
const t = (key, subs) => chrome.i18n.getMessage(key, subs);

// Language of the messages actually used (a UI language without a translation falls back to fr).
const lang = t("langTag") || "fr";
document.documentElement.lang = lang;
document.documentElement.dir = t("@@bidi_dir") || "ltr";
for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll("[data-i18n-label]")) {
  el.setAttribute("aria-label", t(el.dataset.i18nLabel));
  el.title = t(el.dataset.i18nLabel);
}
// Opened from the toolbar icon's context menu, in its own window: the tab comes as ?tab=<id>.
const tabId = Number(new URLSearchParams(location.search).get("tab"));
const tab = tabId ? await chrome.tabs.get(tabId).catch(() => null) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

// The app's theme, as the last ping saw it: same colours as NetsuCast itself.
const POPUP_VARS = {
  surface: "--surface", raised: "--raised", overlay: "--overlay", line: "--line", "line-strong": "--line-strong",
  ink: "--text", "ink-muted": "--muted", accent: "--accent", "accent-hover": "--accent-hover",
  "accent-text": "--accent-text", "accent-ink": "--accent-ink", success: "--success", danger: "--danger",
};
function applyTheme(theme) {
  if (!theme) return;
  for (const [token, name] of Object.entries(POPUP_VARS)) if (theme[token]) document.documentElement.style.setProperty(name, theme[token]);
  if (theme.scheme) document.documentElement.style.colorScheme = theme.scheme;
}
applyTheme((await chrome.storage.local.get("theme")).theme);
chrome.storage.onChanged.addListener((changes) => changes.theme && applyTheme(changes.theme.newValue));

function say(text, ok) {
  const el = $("message");
  el.textContent = text;
  el.className = ok ? "ok" : "err";
}

async function send(request, button) {
  button.disabled = true;
  try {
    try {
      await cast({ ...request, title: tab?.title, start: await startOf() });
    } catch (error) {
      // NetsuCast closed: start it, then send again.
      if (!unreachable(error)) throw error;
      say(t("castLaunching"), true);
      openAppLink();
      if (!(await launchApp(tab?.id, { opened: true }))) throw error;
      await cast({ ...request, title: tab?.title, start: await startOf() });
    }
    if ((await getPrefs()).pauseOnCast) pauseTab();
    say(t("castDone"), true);
    setTimeout(() => window.close(), 600);
  } catch {
    say(t("errNotRunning"), false);
    button.disabled = false;
  }
}

// Where the tab's main video is, and pausing it once it plays in the app (content.js helpers).
async function startOf() {
  if (!tab?.id || !(await getPrefs()).sendPosition) return null;
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => window.__netsucastGrab?.() ?? null });
    const found = results.map((r) => r.result).filter(Boolean).sort((a, b) => Number(b.playing) - Number(a.playing) || b.area - a.area)[0];
    return found?.start ?? null;
  } catch {
    return null;
  }
}
function pauseTab() {
  if (!tab?.id) return;
  chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => window.__netsucastPause?.() }).catch(() => {});
}

async function refreshStatus() {
  const on = await ping();
  const el = $("status");
  el.textContent = on ? t("statusOn") : t("statusOff");
  el.className = `status ${on ? "on" : "off"}`;
}

// --- page button -------------------------------------------------------------------------------
const pageUrl = tab?.url ?? "";
const pageButton = $("send-page");
if (!/^https?:/i.test(pageUrl)) {
  pageButton.disabled = true;
  $("page-hint").textContent = t("popupNoPage");
} else {
  pageButton.addEventListener("click", () => send({ url: pageUrl, kind: "page" }, pageButton));
}

// --- detected streams --------------------------------------------------------------------------
const key = `tab:${tab?.id}`;
const streams = (await chrome.storage.session.get(key))[key] ?? [];
// Most recent first: the playlist of the video being watched is usually the last one loaded.
streams.reverse();
$("count").textContent = streams.length ? `(${new Intl.NumberFormat(lang).format(streams.length)})` : "";
$("empty").hidden = streams.length > 0;

for (const stream of streams) {
  const url = new URL(stream.url);
  const li = document.createElement("li");
  li.title = stream.url;

  const type = document.createElement("span");
  type.className = "type";
  type.textContent = stream.type;

  const info = document.createElement("div");
  info.className = "info";
  const name = document.createElement("div");
  name.className = "name";
  name.dir = "ltr"; // file names and hosts read left to right, also in ar and he
  name.textContent = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? url.pathname);
  const host = document.createElement("div");
  host.className = "host";
  host.dir = "ltr";
  host.textContent = url.hostname;
  info.append(name, host);

  const play = document.createElement("button");
  play.textContent = t("popupPlay");
  play.addEventListener("click", () =>
    send({ url: stream.url, kind: "stream", referer: stream.referer ?? pageUrl }, play),
  );

  li.append(type, info, play);
  $("streams").append(li);
}

// --- settings ----------------------------------------------------------------------------------
let site = null;
try {
  if (/^https?:/i.test(pageUrl)) site = new URL(pageUrl).hostname;
} catch {
  // no site: the "on this site" switch is left out
}
// Two tabs: casting, and the extension's settings.
function showSettings(open) {
  $("settings").hidden = !open;
  $("main").hidden = open;
  $("tab-cast").setAttribute("aria-selected", String(!open));
  $("tab-settings").setAttribute("aria-selected", String(open));
}
$("tab-cast").addEventListener("click", () => showSettings(false));
$("tab-settings").addEventListener("click", () => showSettings(true));
await mountSettings($("settings-list"), { site, onPort: refreshStatus });
// A click on the toolbar icon opens on the settings; "Choose the stream" (right-click on the
// icon) opens on the cast tab.
showSettings(new URLSearchParams(location.search).get("view") !== "cast");

refreshStatus();
