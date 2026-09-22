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

  const host = document.createElement("netsucast-cast");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      button {
        position: fixed; z-index: 2147483647; display: none; align-items: center; gap: 6px;
        padding: 6px 11px 6px 9px; border: 0; border-radius: 999px; cursor: pointer;
        background: rgba(124, 58, 237, .92); color: #fff; box-shadow: 0 4px 16px rgba(0,0,0,.35);
        font: 600 12px/1 "Segoe UI", system-ui, sans-serif; letter-spacing: .01em;
        transition: background .15s, transform .15s;
      }
      button:hover { background: rgb(139, 92, 246); transform: scale(1.04); }
      button.show { display: inline-flex; }
      button.err { background: rgba(220, 38, 38, .95); }
      svg { width: 15px; height: 15px; }
    </style>
    <button type="button" title="Continuer cette vidéo dans NetsuCast (upscale ArtCNN)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><path d="M2 12a9 9 0 0 1 8 8"/><path d="M2 16a5 5 0 0 1 4 4"/><line x1="2" x2="2.01" y1="20" y2="20"/>
      </svg>
      <span>NetsuCast</span>
    </button>`;
  const button = root.querySelector("button");
  const label = root.querySelector("span");

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
    button.style.left = `${Math.min(r.right, window.innerWidth) - 10 - button.offsetWidth}px`;
  }

  function show(video) {
    if (target !== video && !busy) {
      button.classList.remove("err");
      label.textContent = "NetsuCast";
    }
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
    button.classList.remove("show", "err");
    label.textContent = "NetsuCast";
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

  button.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!target || busy) return;
    busy = true;
    label.textContent = "Envoi…";
    const video = target;
    try {
      const res = await chrome.runtime.sendMessage({ type: "cast", ...describe(video) });
      if (!res?.ok) throw new Error(res?.error ?? "échec");
      video.pause();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      label.textContent = "Lecture dans NetsuCast ✓";
    } catch (err) {
      button.classList.add("err");
      const text = String(err?.message ?? err);
      label.textContent =
        text.startsWith("NetsuCast a répondu") || text.startsWith("Vidéo") ? text : "NetsuCast n'est pas lancé";
    } finally {
      busy = false;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, HIDE_AFTER);
    }
  });
})();
