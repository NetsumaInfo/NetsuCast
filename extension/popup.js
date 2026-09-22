import { cast, DEFAULT_PORT, getPort, isPageSite, ping } from "./common.js";

const $ = (id) => document.getElementById(id);
const t = (key, subs) => chrome.i18n.getMessage(key, subs);

// Language of the messages actually used (a UI language without a translation falls back to fr).
const lang = t("langTag") || "fr";
document.documentElement.lang = lang;
document.documentElement.dir = t("@@bidi_dir") || "ltr";
for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
// Opened from the toolbar icon's context menu, in its own window: the tab comes as ?tab=<id>.
const tabId = Number(new URLSearchParams(location.search).get("tab"));
const tab = tabId ? await chrome.tabs.get(tabId).catch(() => null) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

function say(text, ok) {
  const el = $("message");
  el.textContent = text;
  el.className = ok ? "ok" : "err";
}

async function send(request, button) {
  button.disabled = true;
  try {
    await cast({ ...request, title: tab?.title });
    say(t("castDone"), true);
    setTimeout(() => window.close(), 600);
  } catch {
    say(t("errNotRunning"), false);
    button.disabled = false;
  }
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
  $("page-hint").textContent = isPageSite(pageUrl) ? t("popupHintPageSite") : t("popupHintGeneric");
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

// --- port --------------------------------------------------------------------------------------
const portInput = $("port");
portInput.value = await getPort();
portInput.addEventListener("change", async () => {
  const port = Number(portInput.value) || DEFAULT_PORT;
  await chrome.storage.local.set({ port });
  refreshStatus();
});

refreshStatus();
