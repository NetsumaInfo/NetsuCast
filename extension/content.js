// Adds a "NetsuCast" cast button over every video of the page (and of its iframes, where most
// streaming players live). Clicking it pauses the video here and continues it in the app.
(() => {
  if (window.__netsucast) return;
  window.__netsucast = true;

  const MIN_WIDTH = 160;
  const MIN_HEIGHT = 90;
  const HIDE_AFTER = 2500;
  // Links that point at one video: YouTube watch/shorts, X/Twitter status, generic /video/ pages.
  const VIDEO_LINK = /\/watch\?(.*&)?v=|\/shorts\/|\/live\/[\w-]{6,}|\/status(es)?\/\d|\/videos?\/[\w-]+|\/clip\/|youtu\.be\/[\w-]{6,}/i;
  const LINK_SELECTOR = "a[href]";

  // --- finding videos (shadow DOM included) --------------------------------------------------

  function allVideos(root = document, out = []) {
    for (const v of root.querySelectorAll("video")) out.push(v);
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) allVideos(el.shadowRoot, out);
    return out;
  }

  function isBigEnough(video) {
    const r = video.getBoundingClientRect();
    return r.width >= MIN_WIDTH && r.height >= MIN_HEIGHT;
  }

  function parentOf(node) {
    return node.parentElement ?? node.getRootNode?.().host ?? null;
  }

  /**
   * The page of this particular video. The main player stands for the page itself; a preview in
   * a feed (YouTube home, X timeline…) stands for the video its card links to. The search walks
   * up from the video and stops as soon as a container holds another video: past that point any
   * link belongs to a neighbour.
   */
  function ownPageUrl(video) {
    // YouTube plays hover previews in a floating player laid over the card: the video is the
    // one the preview links to, or the card right under it.
    const preview = video.closest("ytd-video-preview, #video-preview");
    if (preview) {
      const own = [...preview.querySelectorAll(LINK_SELECTOR)].find((a) => VIDEO_LINK.test(a.href));
      if (own) return own.href;
      const r = video.getBoundingClientRect();
      for (const el of document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)) {
        if (preview.contains(el)) continue;
        const card = el.closest("a[href]");
        if (card && VIDEO_LINK.test(card.href)) return card.href;
      }
    }
    // Main player of a watch page or of the Shorts feed: the page is the video.
    if (video.closest("ytd-watch-flexy, ytd-reel-video-renderer, ytd-shorts")) return location.href;
    let node = video;
    for (let depth = 0; node && depth < 20; depth++, node = parentOf(node)) {
      if (node.matches?.(LINK_SELECTOR) && VIDEO_LINK.test(node.href)) return node.href;
      if (node === video || !node.querySelectorAll) continue;
      if (node.querySelectorAll("video").length > 1) break;
      const link = [...node.querySelectorAll(LINK_SELECTOR)].find((a) => VIDEO_LINK.test(a.href));
      if (link) return link.href;
    }
    return null;
  }

  function describe(video) {
    const r = video.getBoundingClientRect();
    return {
      start: Number.isFinite(video.duration) ? video.currentTime : null,
      frameUrl: location.href,
      pageUrl: ownPageUrl(video),
      src: video.currentSrc,
      playing: !video.paused,
      area: r.width * r.height,
    };
  }

  // Used by the toolbar icon / Alt+Shift+C (background runs it in every frame): the main video
  // of this frame, playing first, then the biggest.
  window.__netsucastGrab = () => {
    const videos = allVideos().filter(isBigEnough);
    if (!videos.length) return null;
    videos.sort((a, b) => Number(a.paused) - Number(b.paused) || areaOf(b) - areaOf(a));
    return describe(videos[0]);
  };
  window.__netsucastPause = () => {
    for (const v of allVideos()) v.pause();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  function areaOf(video) {
    const r = video.getBoundingClientRect();
    return r.width * r.height;
  }

  // --- button ---------------------------------------------------------------------------------

  // After the extension is reloaded, this orphaned script can no longer reach its messages.
  const t = (key, subs) => {
    try {
      return chrome.i18n.getMessage(key, subs) || "NetsuCast";
    } catch {
      return "NetsuCast";
    }
  };

  /** Error codes come from background.js / common.js; the text is picked here, in the UI language. */
  function errorText(code) {
    if (code === "no-video") return t("errNoVideo");
    const status = /^http-status:(\d+)$/.exec(code);
    if (status) return t("errHttp", [status[1]]);
    return t("errNotRunningShort");
  }

  // A round cast icon in the video's top-left corner (the right side holds the players' own
  // buttons: mute, captions, settings). It opens into a "NetsuCast" pill on hover and while it
  // reports progress. Colours follow the app's default theme.
  const host = document.createElement("netsucast-cast");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      /* The app's theme colours (see applyTheme below); these are its default theme. */
      :host {
        all: initial;
        --nc-accent: #2F6FE0; --nc-accent-hover: #3B7BF0; --nc-accent-ink: #FFFFFF; --nc-accent-text: #4C8DFF;
        --nc-overlay: #1D2330; --nc-ink: #E7EAF0; --nc-line: #222836;
      }
      button {
        position: fixed; z-index: 2147483647; display: none; align-items: center;
        height: 36px; min-width: 36px; max-width: 360px; margin: 0; padding: 0 9px; border: 0;
        border-radius: 18px; cursor: pointer; box-sizing: border-box;
        background: rgba(10, 13, 19, .72); color: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, .35);
        font: 600 13px/1.25 "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
        text-align: start; transition: background-color .15s ease-out;
      }
      button.show { display: inline-flex; }
      button:hover, button:focus-visible, button.open { background: var(--nc-accent); color: var(--nc-accent-ink); }
      button:focus-visible { outline: 2px solid var(--nc-accent-text); outline-offset: 2px; }
      button.err { color: #fff; }
      button.err { background: #C93442; }
      /* Scoped to the button: the tooltip below has its own span and svg. */
      button svg { flex: none; width: 18px; height: 18px; }
      button span {
        overflow: hidden; white-space: nowrap; max-width: 0; opacity: 0;
        transition: max-width .18s ease-out, opacity .12s ease-out, margin .18s ease-out;
      }
      button:hover span, button:focus-visible span, button.open span {
        max-width: 300px; opacity: 1; margin-inline: 7px 3px;
      }
      /* Same bubble as the app's: bordered arrow pointing at the icon, fade, slight zoom, short
         slide from the arrow side. */
      [role="tooltip"] {
        position: fixed; z-index: 2147483647; display: none; max-width: 208px; padding: 6px 10px;
        border: 1px solid var(--nc-line); border-radius: 6px; background: var(--nc-overlay); color: var(--nc-ink);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, .1), 0 2px 4px -2px rgba(0, 0, 0, .1);
        font: 400 12px/1.35 "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
        overflow-wrap: break-word; pointer-events: none; transform-origin: 18px top;
      }
      [role="tooltip"].show { display: block; animation: tip-in .15s ease-out; }
      [role="tooltip"] svg { position: absolute; top: -8px; left: 8px; width: 20px; height: 10px; }
      .tip-fill { fill: var(--nc-overlay); } .tip-edge { fill: var(--nc-line); }
      @keyframes tip-in { from { opacity: 0; scale: .98; translate: 0 -6px; } }
      @media (prefers-reduced-motion: reduce) { * { transition-duration: 1ms !important; animation-duration: 1ms !important; } }
    </style>
    <button type="button" translate="no" aria-describedby="tip">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><path d="M2 12a9 9 0 0 1 8 8"/><path d="M2 16a5 5 0 0 1 4 4"/><line x1="2" x2="2.01" y1="20" y2="20"/>
      </svg>
      <span>NetsuCast</span>
    </button>
    <div id="tip" role="tooltip"><span></span><svg viewBox="0 0 20 10" fill="none" aria-hidden="true">
      <path class="tip-fill" d="M9.66437 2.60207L4.80758 6.97318C4.07308 7.63423 3.11989 8 2.13172 8H0V10H20V8H18.5349C17.5468 8 16.5936 7.63423 15.8591 6.97318L11.0023 2.60207C10.622 2.2598 10.0447 2.25979 9.66437 2.60207Z"/>
      <path class="tip-edge" d="M8.99542 1.85876C9.75604 1.17425 10.9106 1.17422 11.6713 1.85878L16.5281 6.22989C17.0789 6.72568 17.7938 7.00001 18.5349 7.00001L15.89 7L11.0023 2.60207C10.622 2.2598 10.0447 2.2598 9.66437 2.60207L4.77907 7L2.13172 7.00001C2.87268 7.00001 3.58761 6.72568 4.13844 6.22989L8.99542 1.85876Z"/>
    </svg></div>`;
  const button = root.querySelector("button");
  const label = root.querySelector("span");
  const tip = root.querySelector("[role=tooltip]");
  tip.querySelector("span").textContent = t("menuPlay");
  tip.dir = t("@@bidi_dir");
  button.dir = t("@@bidi_dir");

  // Opens at once, like the app's, below the button with its arrow on the cast icon; never while
  // a status is displayed.
  function showTip() {
    if (button.classList.contains("open")) return;
    const r = button.getBoundingClientRect();
    tip.style.left = `${r.left}px`;
    tip.style.top = `${r.bottom + 8}px`;
    tip.classList.add("show");
  }
  function hideTip() {
    tip.classList.remove("show");
  }
  button.addEventListener("pointerenter", showTip);
  button.addEventListener("pointerleave", hideTip);
  button.addEventListener("focus", () => button.matches(":focus-visible") && showTip());
  button.addEventListener("blur", hideTip);
  button.addEventListener("keydown", (e) => e.key === "Escape" && hideTip());

  // Same colours as the app: its theme reaches the extension through /ping (background.js keeps
  // it in storage), and changes apply to every open page.
  const THEME_VARS = { accent: "accent", "accent-hover": "accent-hover", "accent-ink": "accent-ink", "accent-text": "accent-text", overlay: "overlay", ink: "ink", line: "line" };
  function applyTheme(theme) {
    for (const [token, name] of Object.entries(THEME_VARS)) {
      if (theme?.[token]) host.style.setProperty(`--nc-${name}`, theme[token]);
    }
  }
  try {
    chrome.storage.local.get("theme").then(({ theme }) => applyTheme(theme));
    chrome.storage.onChanged.addListener((changes) => changes.theme && applyTheme(changes.theme.newValue));
    chrome.runtime.sendMessage({ type: "refresh-theme" }).catch(() => {});
  } catch {
    // extension reloaded under this page: the default colours stay
  }

  /** Shows a status in the pill (sending, playing, error) or goes back to the icon. */
  function status(text, kind) {
    label.textContent = text ?? "NetsuCast";
    button.classList.toggle("open", text != null);
    button.classList.toggle("err", kind === "err");
    if (text != null) hideTip();
  }

  let target = null; // video the button currently belongs to
  let hideTimer = 0;
  let busy = false;

  function mount() {
    const parent = document.fullscreenElement ?? document.documentElement;
    if (host.parentNode !== parent) parent.appendChild(host);
  }

  function videoAt(x, y) {
    // Smallest match first: a preview drawn over a bigger background video wins.
    let best = null;
    for (const video of allVideos()) {
      if (!isBigEnough(video)) continue;
      const r = video.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      if (!best || areaOf(video) < areaOf(best)) best = video;
    }
    return best;
  }

  function place() {
    if (!target) return;
    const r = target.getBoundingClientRect();
    button.style.top = `${Math.max(r.top, 0) + 10}px`;
    button.style.left = `${Math.max(r.left, 0) + 10}px`;
  }

  function show(video) {
    if (target !== video && !busy) status(null);
    target = video;
    mount();
    button.classList.add("show");
    place();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_AFTER);
  }

  function hide() {
    if (busy || button.matches(":hover")) {
      hideTimer = setTimeout(hide, HIDE_AFTER);
      return;
    }
    button.classList.remove("show");
    status(null);
    hideTip();
    target = null;
  }

  // allVideos() walks the DOM: throttle the hover lookup.
  let lastMove = 0;
  document.addEventListener(
    "mousemove",
    (e) => {
      const now = performance.now();
      if (now - lastMove < 120) return;
      lastMove = now;
      const video = videoAt(e.clientX, e.clientY);
      if (video) show(video);
    },
    { capture: true, passive: true },
  );
  document.addEventListener("fullscreenchange", () => {
    mount();
    place();
  });
  window.addEventListener("scroll", place, { capture: true, passive: true });
  window.addEventListener("resize", place, { passive: true });

  // background.js is starting NetsuCast (it was closed): say so, and hold the video where it is so
  // the position already sent stays right.
  let casting = null;
  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type !== "launching" || !casting) return;
      status(t("castLaunching"));
      casting.pause();
    });
  } catch {
    // extension reloaded under this page
  }

  button.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!target || busy) return;
    busy = true;
    status(t("castSending"));
    const video = target;
    casting = video;
    try {
      const res = await chrome.runtime.sendMessage({ type: "cast", ...describe(video) });
      if (!res?.ok) throw new Error(res?.error ?? "failed");
      video.pause();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      status(t("castPlaying"));
    } catch (err) {
      status(errorText(String(err?.message ?? err)), "err");
    } finally {
      casting = null;
      busy = false;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, HIDE_AFTER);
    }
  });
})();
