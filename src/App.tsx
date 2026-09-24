import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useTranslation } from "react-i18next";
import { command } from "tauri-plugin-mpv-api";
import { House, LoaderCircle, Sparkles, TriangleAlert, X } from "lucide-react";
import { CompareOverlay } from "./components/CompareOverlay";
import { Controls } from "./components/Controls";
import { InfoPanel } from "./components/InfoPanel";
import { InstallDialog } from "./components/InstallDialog";
import { SettingsDialog, type Section } from "./components/SettingsDialog";
import { UpdateButton } from "./components/UpdateButton";
import { WhatsNew } from "./components/WhatsNew";
import { IconButton, TooltipLayer } from "./components/ui";
import { Welcome, type Warmup } from "./components/Welcome";
import { usePlayer } from "./hooks/usePlayer";
import { applyLanguage } from "./i18n";
import { applyTheme } from "./lib/theme";
import { describeLoadError } from "./lib/errors";
import * as player from "./lib/player";
import { MODELS, autoModel, resolveModel, type Environment, type LoadTarget, type Model, type Settings, type UpscaleScale } from "./lib/types";
import { modelName, summarize } from "./lib/upscaleInfo";

const HIDE_DELAY = 2500;
const EXTENSION_SEEN_KEY = "netsucast.extensionSeen";
const DIRECT_MEDIA = /\.(m3u8|mpd|mp4|m4v|webm|mkv|mov|ts)(\?|#|$)/i;

function readExtensionSeen(): boolean {
  try {
    return localStorage.getItem(EXTENSION_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

const upscaleOf = (s: Settings, env: Environment | null): player.Upscale => ({
  model: resolveModel(s.model, env),
  force: s.forceUpscale,
  scale: s.upscaleScale,
});

/** Auto mode drops to this model when the card cannot keep up with C4F32 DS. */
const LIGHT_MODEL: Model = "C4F16_DS";

/** A URL typed by hand: direct media goes straight to mpv, anything else through yt-dlp. */
function targetFromInput(input: string): LoadTarget {
  if (!/^https?:\/\//i.test(input)) return { url: input, kind: "file" };
  return { url: input, kind: DIRECT_MEDIA.test(input) ? "stream" : "page" };
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [env, setEnv] = useState<Environment | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [ready, setReady] = useState(false);
  const [mpvError, setMpvError] = useState<string | null>(null);
  const [target, setTarget] = useState<LoadTarget | null>(null);
  const [upscale, setUpscale] = useState<player.Upscale>({ model: "off", force: true, scale: "auto" });
  const model = upscale.model;
  const [maxHeight, setMaxHeight] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState<Section>("playback");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** A neutral message that goes away on its own (not an error). */
  const [info, setInfo] = useState<string | null>(null);
  useEffect(() => {
    if (!info) return;
    const id = setTimeout(() => setInfo(null), 6000);
    return () => clearTimeout(id);
  }, [info]);
  const [active, setActive] = useState(true);
  const [warmup, setWarmup] = useState<Warmup | null>(null);
  const [modelLoading, setModelLoading] = useState<Model | null>(null);
  const [extensionInstalled, setExtensionInstalled] = useState(readExtensionSeen);
  const [showInstall, setShowInstall] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [split, setSplit] = useState(0.5);
  // Auto model: follows the graphics card, and steps down once if it cannot keep up.
  const [auto, setAuto] = useState(false);
  const splitAt = useRef(0.5);
  // Set by the home button: shows the welcome screen right away, without waiting for mpv to
  // report that it went idle.
  const [atHome, setAtHome] = useState(false);
  const { state, dismissError } = usePlayer(ready);

  // Casts can arrive at any time (even before mpv is up), so the latest values live in a ref.
  const live = useRef({
    ready,
    env,
    settings,
    upscale,
    maxHeight,
    pending: null as LoadTarget | null,
    warming: false,
  });
  live.current = { ...live.current, ready, env, settings, upscale, maxHeight };

  // --- window --------------------------------------------------------------------------------
  const toggleFullscreen = useCallback(async (force?: boolean) => {
    const win = getCurrentWindow();
    const next = force ?? !(await win.isFullscreen());
    await win.setFullscreen(next);
    setFullscreen(next);
  }, []);

  // --- startup -------------------------------------------------------------------------------
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const [s, e] = await Promise.all([invoke<Settings>("get_settings"), invoke<Environment>("get_environment")]);
      applyLanguage(s.language);
      applyTheme(s.theme);
      player.setWarmScope(e);
      setSettings(s);
      setEnv(e);
      setAuto(s.model === "auto");
      setUpscale(upscaleOf(s, e));
      setMaxHeight(s.maxHeight);
      if (s.alwaysOnTop) getCurrentWindow().setAlwaysOnTop(true);
      if (!e.mpvPath) {
        setMpvError(t("welcome.mpvMissing"));
        return;
      }
      try {
        await player.startMpv(e, s);
        setReady(true);
      } catch (err) {
        setMpvError(String(err));
      }
    })();
  }, [t]);

  // --- model warm-up -------------------------------------------------------------------------
  // The first compilation of an ArtCNN model freezes the picture for a long while. It is done
  // once, on a hidden black clip behind the welcome screen; mpv's shader cache keeps the result.
  useEffect(() => {
    if (!ready || !env || !settings) return;
    // The model in use, and in auto mode the lighter one it may fall back to. The others are
    // prepared the first time they are picked.
    const base = upscaleOf(settings, env);
    const models = settings.model === "auto" ? [base.model, LIGHT_MODEL] : [base.model];
    const todo = [...new Set(models)]
      .filter((m) => m !== "off")
      .map((m) => ({ ...base, model: m }))
      .filter((u) => !player.isWarmed(u));
    if (!todo.length || live.current.pending) return;

    live.current.warming = true;
    (async () => {
      await command("loadfile", [player.WARMUP_SOURCE, "replace"]);
      for (const [i, u] of todo.entries()) {
        if (!live.current.warming) return;
        setWarmup({ model: u.model, index: i + 1, total: todo.length });
        await player.applyUpscale(env, u);
        if (await player.waitForModel(u.model)) player.markWarmed(u);
      }
      if (!live.current.warming) return;
      live.current.warming = false;
      setWarmup(null);
      await player.stop();
      await player.applyUpscale(env, live.current.upscale);
    })();
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- loading -------------------------------------------------------------------------------
  const open = useCallback(
    async (target: LoadTarget, start?: number) => {
      const { ready, env, settings, upscale, maxHeight } = live.current;
      if (!ready || !env || !settings) {
        live.current.pending = target;
        return;
      }
      if (live.current.warming) {
        // A real video wins over the warm-up; the remaining models get compiled next launch.
        live.current.warming = false;
        setWarmup(null);
        await player.applyUpscale(env, upscale);
      }
      setTarget(target);
      setAtHome(false);
      dismissError();
      const from = start ?? (settings.resumePosition ? (target.start ?? undefined) : undefined);
      try {
        await player.load(target, env, { ...settings, maxHeight }, from);
      } catch (e) {
        setNotice(t("errors.loadFailed", { reason: String(e) }));
      }
    },
    [dismissError, t],
  );

  useEffect(() => {
    if (ready && live.current.pending) {
      const pending = live.current.pending;
      live.current.pending = null;
      open(pending);
    }
  }, [ready, open]);

  useEffect(() => {
    const markExtension = () => {
      setExtensionInstalled(true);
      try {
        localStorage.setItem(EXTENSION_SEEN_KEY, "1");
      } catch {
        // not persisted: the guide shows again next launch
      }
    };
    const unHello = listen("extension-hello", markExtension);
    const unCast = listen<LoadTarget>("cast", (e) => {
      markExtension();
      open(e.payload);
      if (live.current.settings?.fullscreenOnCast) toggleFullscreen(true);
    });
    // Casts are heard from here on: an extension that just launched NetsuCast waits for this.
    Promise.all([unHello, unCast]).then(() => invoke("frontend_ready")).catch(() => {});
    const unDrop = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "drop" && e.payload.paths.length) open({ url: e.payload.paths[0], kind: "file" });
    });
    return () => {
      unHello.then((u) => u());
      unCast.then((u) => u());
      unDrop.then((u) => u());
    };
  }, [open, toggleFullscreen]);

  const playing = ready && !state.idle && !warmup && !atHome;

  const goHome = useCallback(async () => {
    setAtHome(true);
    setShowInfo(false);
    setOpenMenu(null);
    const { env, upscale } = live.current;
    if (upscale.compare && env) {
      const next = { ...upscale, compare: false };
      setUpscale(next);
      live.current.upscale = next;
      player.applyUpscale(env, next);
    }
    if (fullscreen) toggleFullscreen(false);
    try {
      await player.stop();
    } catch {
      // mpv busy: the welcome screen is shown anyway, the next video replaces this one
    }
  }, [fullscreen, toggleFullscreen]);

  // The tray menu speaks the interface language.
  useEffect(() => {
    invoke("set_tray_labels", { open: t("tray.open"), quit: t("tray.quit") }).catch(() => {});
  }, [i18n.language, t]);

  // Window closed while NetsuCast keeps running for the extension: the video stops, home shows.
  useEffect(() => {
    const un = listen("went-background", () => {
      setShowSettings(false);
      setShowInstall(false);
      goHome();
    });
    return () => void un.then((u) => u());
  }, [goHome]);

  useEffect(() => {
    getCurrentWindow().setTitle(playing && state.title ? `${state.title} — NetsuCast` : "NetsuCast");
  }, [state.title, playing]);

  // Remember the volume between sessions (debounced: the slider fires on every pixel).
  useEffect(() => {
    if (!settings || !ready || Math.round(state.volume) === Math.round(settings.volume)) return;
    const id = setTimeout(() => {
      const next = { ...settings, volume: Math.round(state.volume) };
      invoke("save_settings", { settings: next }).then(() => setSettings(next));
    }, 1000);
    return () => clearTimeout(id);
  }, [state.volume, settings, ready]);

  // --- controls visibility -------------------------------------------------------------------
  const hideTimer = useRef<number>(undefined);
  const poke = useCallback(() => {
    setActive(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setActive(false), HIDE_DELAY);
  }, []);
  const controlsVisible = active || state.pause || openMenu !== null || showSettings;

  // --- actions -------------------------------------------------------------------------------
  const applyUpscale = useCallback(async (next: player.Upscale) => {
    const env = live.current.env;
    if (!env) return;
    setUpscale(next);
    live.current.upscale = next;
    await player.applyUpscale(env, next, splitAt.current);
    if (player.isWarmed(next)) return;
    setModelLoading(next.model);
    if (await player.waitForModel(next.model)) player.markWarmed(next);
    setModelLoading((current) => (current === next.model ? null : current));
  }, []);

  const changeModel = useCallback(
    (m: Model) => {
      setAuto(false);
      return applyUpscale({ ...live.current.upscale, model: m });
    },
    [applyUpscale],
  );
  const chooseAuto = useCallback(() => {
    setAuto(true);
    return applyUpscale({ ...live.current.upscale, model: autoModel(live.current.env) });
  }, [applyUpscale]);

  // Auto mode, measured: steps down to C4F16 DS for the rest of the session when C4F32 DS keeps
  // the GPU over the frame time for 10 s in a row, or frames drop while the GPU is near its
  // limit. Never judged while things settle: the first seconds after a file opens, a seek, a
  // pause, buffering, a model or window change are shader compilation and cache filling, not the
  // steady cost of the model, and they used to trip the step-down on a card that copes fine.
  const SETTLE_MS = 20_000;
  const settleUntil = useRef(0);
  const lastPos = useRef(0);
  const samples = useRef<{ slow: boolean; busy: boolean; drops: number }[]>([]);
  useEffect(() => {
    settleUntil.current = performance.now() + SETTLE_MS;
    samples.current.length = 0;
  }, [state.loading, state.buffering, state.pause, upscale.model, upscale.scale, upscale.compare, modelLoading, state.displayWidth, state.displayHeight]);
  useEffect(() => {
    // A jump in the position is a seek: the decoder and the cache start over.
    if (Math.abs(state.timePos - lastPos.current) > 3) settleUntil.current = performance.now() + SETTLE_MS;
    lastPos.current = state.timePos;
  }, [state.timePos]);
  useEffect(() => {
    const gpu = state.upscale;
    const history = samples.current;
    if (!auto || upscale.model === LIGHT_MODEL || upscale.model === "off" || !gpu || state.pause || state.buffering || !state.fps || modelLoading) {
      history.length = 0;
      return;
    }
    if (performance.now() < settleUntil.current) return;
    const budget = 1000 / state.fps;
    history.push({ slow: gpu.frameMs > budget, busy: gpu.frameMs > budget * 0.8, drops: state.droppedFrames });
    if (history.length > 10) history.shift();
    if (history.length < 10) return;
    const tooSlow = history.every((h) => h.slow);
    // More than 2 % of the frames dropped over those 10 s, with the GPU near its limit all along.
    const dropping = state.droppedFrames - history[0].drops > state.fps * 10 * 0.02 && history.every((h) => h.busy);
    if (!tooSlow && !dropping) return;
    history.length = 0;
    const from = upscale.model;
    applyUpscale({ ...live.current.upscale, model: LIGHT_MODEL });
    setInfo(t("player.autoStepDown", { from: modelName(from), to: modelName(LIGHT_MODEL) }));
  }, [state.upscale]); // eslint-disable-line react-hooks/exhaustive-deps
  const changeScale = useCallback((scale: UpscaleScale) => applyUpscale({ ...live.current.upscale, scale }), [applyUpscale]);

  // Before/after: only meaningful while ArtCNN actually runs.
  const canCompare = !!upscale.compare || summarize(state, upscale, modelLoading !== null).status === "active";
  const switching = useRef(false);
  const toggleCompare = useCallback(async () => {
    if (switching.current) return; // a second press while mpv reloads the shaders
    switching.current = true;
    try {
      await applyUpscale({ ...live.current.upscale, compare: !live.current.upscale.compare });
    } finally {
      switching.current = false;
    }
  }, [applyUpscale]);

  // The line on screen follows the pointer at once; mpv reloads its shaders with the new
  // position, one reload at a time, always with the latest position.
  const splitSync = useRef({ busy: false, next: null as number | null });
  const moveSplit = useCallback((value: number) => {
    setSplit(value);
    splitAt.current = value;
    const sync = splitSync.current;
    sync.next = value;
    if (sync.busy) return;
    sync.busy = true;
    (async () => {
      while (sync.next !== null) {
        const at = sync.next;
        sync.next = null;
        const { env, upscale } = live.current;
        if (!env || !upscale.compare) break;
        try {
          await player.applyUpscale(env, upscale, at);
        } catch {
          // mpv busy: the next position (or the next move) tries again
        }
        await new Promise((r) => setTimeout(r, 60));
      }
      sync.busy = false;
    })();
  }, []);

  const changeQuality = (h: number) => {
    setMaxHeight(h);
    live.current.maxHeight = h;
    if (target?.kind === "page") open(target, state.timePos);
  };

  const closeSettings = useCallback(() => setShowSettings(false), []);
  const openSettings = useCallback((section: Section) => {
    setSettingsSection(section);
    setShowSettings(true);
  }, []);
  const closeInstall = useCallback(() => setShowInstall(false), []);

  const saveSettings = async (next: Settings) => {
    await invoke("save_settings", { settings: next });
    const prev = settings;
    if (ready) {
      if (next.model !== prev?.model || next.forceUpscale !== prev?.forceUpscale || next.upscaleScale !== prev?.upscaleScale) {
        setAuto(next.model === "auto");
        applyUpscale(upscaleOf(next, env));
      }
      if (next.deband !== prev?.deband) player.setDeband(next.deband);
      if (next.hwdec !== prev?.hwdec) player.setHwdec(next.hwdec);
      if (next.subLangs !== prev?.subLangs) player.setSlang(next.subLangs);
      if (next.audioLangs !== prev?.audioLangs) player.setAlang(next.audioLangs);
      if (next.subScale !== prev?.subScale) player.setSubScale(next.subScale);
    }
    if (next.language !== prev?.language) applyLanguage(next.language);
    applyTheme(next.theme);
    if (next.alwaysOnTop !== prev?.alwaysOnTop) getCurrentWindow().setAlwaysOnTop(next.alwaysOnTop);
    if (next.maxHeight !== prev?.maxHeight) setMaxHeight(next.maxHeight);
    setSettings(next);
    setShowSettings(false);
  };

  // --- keyboard ------------------------------------------------------------------------------
  const seekStep = settings?.seekStep ?? 10;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (showSettings || showInstall || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") {
        if (openMenu) setOpenMenu(null);
        else if (upscale.compare) toggleCompare();
        else if (showInfo) setShowInfo(false);
        else if (fullscreen) toggleFullscreen(false);
        return;
      }
      if (e.key.toLowerCase() === "f") return void toggleFullscreen();
      if (!playing) return;
      poke();
      const actions: Record<string, () => unknown> = {
        " ": player.togglePause,
        k: player.togglePause,
        ArrowLeft: () => player.seekRelative(-5),
        ArrowRight: () => player.seekRelative(5),
        j: () => player.seekRelative(-seekStep),
        l: () => player.seekRelative(seekStep),
        ArrowUp: () => player.setVolume(state.volume + 5),
        ArrowDown: () => player.setVolume(state.volume - 5),
        m: player.toggleMute,
        c: () => command("cycle", ["sub"]),
        i: () => setShowInfo((v) => !v),
        I: player.toggleStats,
        h: goHome,
        u: () => changeModel(MODELS[(MODELS.indexOf(model) + 1) % MODELS.length]),
        b: () => canCompare && toggleCompare(),
      };
      const action = actions[e.key] ?? actions[e.key.toLowerCase()];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, upscale.compare, state.volume, showSettings, showInstall, showInfo, openMenu, fullscreen, model, seekStep, poke, toggleFullscreen, changeModel, goHome, canCompare, toggleCompare]);

  // Single click = pause, double click = fullscreen: the single click waits to be sure.
  const clickTimer = useRef<number>(undefined);
  const onSurfaceClick = () => {
    clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => player.togglePause(), 220);
  };
  const onSurfaceDoubleClick = () => {
    clearTimeout(clickTimer.current);
    toggleFullscreen();
  };

  const fade = controlsVisible ? "opacity-100" : "pointer-events-none opacity-0";

  return (
    <div
      className={`relative h-screen w-screen overflow-hidden select-none ${ready ? "" : "bg-page"} ${playing && !controlsVisible ? "cursor-none" : ""}`}
      onMouseMove={poke}
    >
      {!playing && (
        <div className="absolute inset-0 bg-page">
          <Welcome
            mpvError={mpvError}
            warmup={warmup}
            onOpen={(url) => open(targetFromInput(url))}
            onSettings={settings ? () => openSettings("playback") : undefined}
            onSupport={settings ? () => openSettings("about") : undefined}
            extensionInstalled={extensionInstalled}
            onInstallExtension={env?.extensionDir ? () => setShowInstall(true) : undefined}
          />
        </div>
      )}

      {playing && (
        // Player chrome sits on the video: it keeps dark tokens in the light themes (index.css).
        <div className="on-video contents">
          <div
            className="absolute inset-0"
            onClick={onSurfaceClick}
            onDoubleClick={onSurfaceDoubleClick}
            onWheel={(e) => player.setVolume(state.volume + (e.deltaY < 0 ? 5 : -5))}
          />

          {upscale.compare && upscale.model !== "off" && (
            <CompareOverlay state={state} split={split} onSplit={moveSplit} model={modelName(upscale.model)} />
          )}

          <div className={`absolute inset-x-0 top-0 flex items-center gap-1.5 bg-gradient-to-b from-black/75 to-transparent px-3 pt-2 pb-10 transition-opacity duration-200 ${fade}`}>
            <IconButton aria-label={t("player.home")} shortcut="H" onClick={goHome}>
              <House size={19} strokeWidth={1.75} />
            </IconButton>
            <span className="min-w-0 flex-1 truncate text-sm text-ink" dir="auto" data-tip={state.title || undefined} data-tip-side="bottom">
              {state.title}
            </span>
            <UpdateButton />
          </div>

          {(state.loading || state.buffering) && !modelLoading && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <LoaderCircle className="animate-spin text-white/80" size={40} strokeWidth={1.5} />
            </div>
          )}

          {modelLoading && (
            <div role="status" className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="flex items-center gap-2.5 rounded-panel border border-line bg-page/90 px-4 py-2.5 text-sm text-ink shadow-overlay">
                <Sparkles size={16} strokeWidth={1.75} className="animate-pulse text-accent-text" />
                {t("player.preparingModel", { model: modelName(modelLoading) })}
              </div>
            </div>
          )}

          <div className={`absolute inset-x-0 bottom-0 transition-opacity duration-200 ${fade}`}>
            <Controls
              state={state}
              upscale={upscale}
              preparing={modelLoading !== null}
              maxHeight={maxHeight}
              seekStep={seekStep}
              canChangeQuality={target?.kind === "page"}
              fullscreen={fullscreen}
              infoOpen={showInfo}
              openMenu={openMenu}
              setOpenMenu={setOpenMenu}
              onModel={changeModel}
              auto={auto}
              autoTarget={autoModel(env)}
              onAuto={chooseAuto}
              onScale={changeScale}
              onQuality={changeQuality}
              onInfo={() => setShowInfo((v) => !v)}
              onFullscreen={() => toggleFullscreen()}
              onSettings={() => openSettings("playback")}
            />
          </div>

          {showInfo && (
            <InfoPanel
              state={state}
              upscale={upscale}
              preparing={modelLoading !== null}
              target={target}
              maxHeight={maxHeight}
              fullscreen={fullscreen}
              env={env}
              compare={!!upscale.compare}
              canCompare={canCompare}
              onCompare={toggleCompare}
              onClose={() => setShowInfo(false)}
            />
          )}
        </div>
      )}

      {info && !state.error && !notice && (
        <div
          role="status"
          className="absolute top-14 left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 animate-fade-in items-center gap-2.5 rounded-panel border border-line bg-page/95 px-4 py-2.5 text-sm text-ink shadow-overlay"
        >
          <Sparkles size={16} strokeWidth={1.75} className="shrink-0 text-accent-text" />
          {info}
        </div>
      )}

      {(state.error || notice) && (
        <div
          role="alert"
          className="absolute top-14 left-1/2 z-40 flex w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 animate-fade-in items-start gap-3 rounded-panel border border-danger/30 bg-page/95 py-2 ps-4 pe-1.5 text-sm shadow-overlay"
        >
          <TriangleAlert size={16} className="mt-2 shrink-0 text-danger" />
          <span className="min-w-0 flex-1 py-1.5 break-words text-ink">
            {notice ?? describeLoadError(state.error ?? "", state.ytdlError, target)}
          </span>
          <IconButton
            aria-label={t("player.dismiss")}
            onClick={() => {
              setNotice(null);
              dismissError();
            }}
          >
            <X size={15} strokeWidth={1.75} className="text-ink-muted" />
          </IconButton>
        </div>
      )}

      {showInstall && env?.extensionDir && (
        <InstallDialog extensionDir={env.extensionDir} installed={extensionInstalled} onClose={closeInstall} />
      )}

      {showSettings && settings && <SettingsDialog settings={settings} initialSection={settingsSection} env={env} onClose={closeSettings} onSave={saveSettings} />}

      <WhatsNew />
      <TooltipLayer />
    </div>
  );
}
