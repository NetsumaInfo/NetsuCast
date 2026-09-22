import { cast, DEFAULT_PORT, getPort, isPageSite, ping } from "./common.js";

const $ = (id) => document.getElementById(id);
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
    say("Envoyé ✓", true);
    setTimeout(() => window.close(), 600);
  } catch {
    say("NetsuCast ne répond pas. L'appli est lancée ?", false);
    button.disabled = false;
  }
}

async function refreshStatus() {
  const on = await ping();
  const el = $("status");
  el.textContent = on ? "Lecteur connecté" : "Lecteur non lancé";
  el.className = `status ${on ? "on" : "off"}`;
}

// --- page button -------------------------------------------------------------------------------
const pageUrl = tab?.url ?? "";
const pageButton = $("send-page");
if (!/^https?:/i.test(pageUrl)) {
  pageButton.disabled = true;
  $("page-hint").textContent = "Aucune page web dans cet onglet.";
} else {
  $("page-hint").textContent = isPageSite(pageUrl)
    ? "Recommandé pour ce site : yt-dlp récupère la meilleure qualité et les sous-titres."
    : "yt-dlp essaie de trouver la vidéo de la page. Sinon, choisis un flux ci-dessous.";
  pageButton.addEventListener("click", () => send({ url: pageUrl, kind: "page" }, pageButton));
}

// --- detected streams --------------------------------------------------------------------------
const key = `tab:${tab?.id}`;
const streams = (await chrome.storage.session.get(key))[key] ?? [];
// Most recent first: the playlist of the video being watched is usually the last one loaded.
streams.reverse();
$("count").textContent = streams.length ? `(${streams.length})` : "";
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
  name.textContent = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? url.pathname);
  const host = document.createElement("div");
  host.className = "host";
  host.textContent = url.hostname;
  info.append(name, host);

  const play = document.createElement("button");
  play.textContent = "Lire";
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
