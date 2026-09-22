// Adds a "NetsuCast" cast button over every video of the page (and of its iframes, where most
// streaming players live). Clicking it pauses the video here and continues it in the app.
(() => {
  if (window.__netsucast) return;
  window.__netsucast = true;

  const MIN_WIDTH = 240;
  const MIN_HEIGHT = 135;
  const HIDE_AFTER = 2500;

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
    for (const video of document.querySelectorAll("video")) {
      const r = video.getBoundingClientRect();
      if (r.width < MIN_WIDTH || r.height < MIN_HEIGHT) continue;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return video;
    }
    return null;
  }

  function place() {
    if (!target) return;
    const r = target.getBoundingClientRect();
    button.style.top = `${Math.max(r.top, 0) + 12}px`;
    button.style.left = `${Math.min(r.right, window.innerWidth) - 12 - button.offsetWidth}px`;
  }

  function show(video) {
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

  document.addEventListener(
    "mousemove",
    (e) => {
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
    const live = !Number.isFinite(video.duration);
    const start = live ? null : video.currentTime;
    try {
      const res = await chrome.runtime.sendMessage({ type: "cast", start, frameUrl: location.href, src: video.currentSrc });
      if (!res?.ok) throw new Error(res?.error ?? "échec");
      video.pause();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      label.textContent = "Lecture dans NetsuCast ✓";
    } catch (err) {
      button.classList.add("err");
      const text = String(err?.message ?? err);
      label.textContent = text.startsWith("NetsuCast a répondu") ? text : "NetsuCast n'est pas lancé";
    } finally {
      busy = false;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, HIDE_AFTER);
    }
  });

})();
