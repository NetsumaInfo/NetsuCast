import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { command } from "tauri-plugin-mpv-api";
import { LoaderCircle, Sparkles, X } from "lucide-react";
import { Controls } from "./components/Controls";
import { InstallDialog } from "./components/InstallDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { Welcome, type Warmup } from "./components/Welcome";
import { usePlayer } from "./hooks/usePlayer";
import * as player from "./lib/player";
import { MODEL_LABELS, MODELS, type Environment, type LoadTarget, type Model, type Settings } from "./lib/types";

const HIDE_DELAY = 2500;
const EXTENSION_SEEN_KEY = "netsucast.extensionSeen";

function readExtensionSeen(): boolean {
  try {
    return localStorage.getItem(EXTENSION_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
const DIRECT_MEDIA = /\.(m3u8|mpd|mp4|m4v|webm|mkv|mov|ts)(\?|#|$)/i;

/** A URL typed by hand: direct media goes straight to mpv, anything else through yt-dlp. */
function targetFromInput(input: string): LoadTarget {
  if (!/^https?:\/\//i.test(input)) return { url: input, kind: "file" };
  return { url: input, kind: DIRECT_MEDIA.test(input) ? "stream" : "page" };
}

export default function App() {
  const [env, setEnv] = useState<Environment | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [ready, setReady] = useState(false);
  const [mpvError, setMpvError] = useState<string | null>(null);
  const [target, setTarget] = useState<LoadTarget | null>(null);
  const [model, setModel] = useState<Model>("off");
  const [maxHeight, setMaxHeight] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [warmup, setWarmup] = useState<Warmup | null>(null);
  const [modelLoading, setModelLoading] = useState<Model | null>(null);
  const [extensionInstalled, setExtensionInstalled] = useState(readExtensionSeen);
  const [showInstall, setShowInstall] = useState(false);
  const { state, dismissError } = usePlayer(ready);

  // Casts can arrive at any time (even before mpv is up), so the latest values live in a ref.
  const live = useRef({
    ready,
    env,
    settings,
    model,
    maxHeight,
    pending: null as LoadTarget | null,
    warming: false,
  });
  live.current = { ...live.current, ready, env, settings, model, maxHeight };

  // --- startup -------------------------------------------------------------------------------
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const [s, e] = await Promise.all([invoke<Settings>("get_settings"), invoke<Environment>("get_environment")]);
      setSettings(s);
      setEnv(e);
      setModel(s.model);
      setMaxHeight(s.maxHeight);
      if (!e.mpvPath) {
        setMpvError("mpv.exe introuvable.");
        return;
      }
      try {
        await player.startMpv(e, s);
        setReady(true);
      } catch (err) {
        setMpvError(String(err));
      }
    })();
  }, []);

  // --- model warm-up -------------------------------------------------------------------------
  // The first compilation of an ArtCNN model freezes the picture for a long while. It is done
  // once, on a hidden black clip behind the welcome screen; mpv's shader cache keeps the result.
  useEffect(() => {
    if (!ready || !env || !settings) return;
    const force = settings.forceUpscale;
    const todo = [settings.model, ...MODELS.filter((m) => m !== settings.model)].filter(
      (m) => !player.isWarmed(m, force),
    );
    if (!todo.length || live.current.pending) return;

    live.current.warming = true;
    (async () => {
      await command("loadfile", [player.WARMUP_SOURCE, "replace"]);
      for (const [i, m] of todo.entries()) {
        if (!live.current.warming) return;
        setWarmup({ model: m, index: i + 1, total: todo.length });
        await player.applyModel(env, m, force);
        if (await player.waitForModel(m)) player.markWarmed(m, force);
      }
      if (!live.current.warming) return;
      live.current.warming = false;
      setWarmup(null);
      await player.stop();
      await player.applyModel(env, live.current.model, force);
    })();
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- loading -------------------------------------------------------------------------------
  const open = useCallback(async (t: LoadTarget, start?: number) => {
    const { ready, env, settings, model, maxHeight } = live.current;
    if (!ready || !env || !settings) {
      live.current.pending = t;
      return;
    }
    if (live.current.warming) {
      // A real video wins over the warm-up; the remaining models get compiled next launch.
      live.current.warming = false;
      setWarmup(null);
      await player.applyModel(env, model, settings.forceUpscale);
    }
    setTarget(t);
    dismissError();
    try {
      await player.load(t, { ...settings, maxHeight }, start ?? t.start ?? undefined);
    } catch (e) {
      setNotice(`Chargement impossible : ${e}`);
    }
  }, [dismissError]);

  useEffect(() => {
    if (ready && live.current.pending) {
      const t = live.current.pending;
      live.current.pending = null;
      open(t);
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
    });
    const unDrop = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "drop" && e.payload.paths.length) open({ url: e.payload.paths[0], kind: "file" });
    });
    return () => {
      unHello.then((u) => u());
      unCast.then((u) => u());
      unDrop.then((u) => u());
    };
  }, [open]);

  // --- window --------------------------------------------------------------------------------
  const toggleFullscreen = useCallback(async (force?: boolean) => {
    const win = getCurrentWindow();
    const next = force ?? !(await win.isFullscreen());
    await win.setFullscreen(next);
    setFullscreen(next);
  }, []);

  const playing = ready && !state.idle && !warmup;

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
  const applyModel = useCallback(async (m: Model, force: boolean) => {
    const env = live.current.env;
    if (!env) return;
    setModel(m);
    live.current.model = m;
    await player.applyModel(env, m, force);
    if (player.isWarmed(m, force)) return;
    setModelLoading(m);
    if (await player.waitForModel(m)) player.markWarmed(m, force);
    setModelLoading((current) => (current === m ? null : current));
  }, []);

  const changeModel = useCallback(
    (m: Model) => applyModel(m, live.current.settings?.forceUpscale ?? true),
    [applyModel],
  );

  const changeQuality = (h: number) => {
    setMaxHeight(h);
    live.current.maxHeight = h;
    if (target?.kind === "page") open(target, state.timePos);
  };

  const saveSettings = async (next: Settings) => {
    await invoke("save_settings", { settings: next });
    if (ready) {
      if (next.model !== settings?.model || next.forceUpscale !== settings?.forceUpscale) {
        applyModel(next.model, next.forceUpscale);
      }
      if (next.deband !== settings?.deband) player.setDeband(next.deband);
      if (next.hwdec !== settings?.hwdec) player.setHwdec(next.hwdec);
      if (next.subLangs !== settings?.subLangs) player.setSlang(next.subLangs);
    }
    if (next.maxHeight !== settings?.maxHeight) setMaxHeight(next.maxHeight);
    setSettings(next);
    setShowSettings(false);
  };

  // --- keyboard ------------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (showSettings || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") {
        if (openMenu) setOpenMenu(null);
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
        j: () => player.seekRelative(-10),
        l: () => player.seekRelative(10),
        ArrowUp: () => player.setVolume(state.volume + 5),
        ArrowDown: () => player.setVolume(state.volume - 5),
        m: player.toggleMute,
        c: () => command("cycle", ["sub"]),
        i: player.toggleStats,
        u: () => changeModel(MODELS[(MODELS.indexOf(model) + 1) % MODELS.length]),
      };
      const action = actions[e.key] ?? actions[e.key.toLowerCase()];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, state.volume, showSettings, openMenu, fullscreen, model, poke, toggleFullscreen, changeModel]);

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

  // Without forcing, ArtCNN only runs when the picture is drawn at least 1.3× larger than the source.
  const forced = settings?.forceUpscale ?? true;
  const enlarged =
    state.videoHeight > 0 &&
    state.displayHeight > state.videoHeight * 1.3 &&
    state.displayWidth > state.videoWidth * 1.3;
  const upscaling = model !== "off" && (forced || enlarged);

  return (
    <div
      className={`relative h-screen w-screen overflow-hidden select-none ${ready ? "" : "bg-neutral-950"} ${playing && !controlsVisible ? "cursor-none" : ""}`}
      onMouseMove={poke}
    >
      {!playing && (
        <div className="absolute inset-0 bg-neutral-950">
          <Welcome
            mpvError={mpvError}
            warmup={warmup}
            onOpen={(url) => open(targetFromInput(url))}
            onSettings={settings ? () => setShowSettings(true) : undefined}
            extensionInstalled={extensionInstalled}
            onInstallExtension={env?.extensionDir ? () => setShowInstall(true) : undefined}
          />
        </div>
      )}

      {playing && (
        <>
          <div className="absolute inset-0" onClick={onSurfaceClick} onDoubleClick={onSurfaceDoubleClick} />

          <div className={`pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent px-5 pt-3 pb-10 transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "opacity-0"}`}>
            <span className="block truncate text-sm font-medium text-neutral-100">{state.title}</span>
          </div>

          {(state.loading || state.buffering) && !modelLoading && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <LoaderCircle className="animate-spin text-white/80" size={48} />
            </div>
          )}

          {modelLoading && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="flex items-center gap-3 rounded-xl bg-black/80 px-5 py-3 text-sm text-neutral-100 shadow-xl">
                <Sparkles size={18} className="animate-pulse text-violet-400" />
                Préparation de {MODEL_LABELS[modelLoading].split(" ·")[0]}… (première fois seulement)
              </div>
            </div>
          )}

          <div className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <Controls
              state={state}
              model={model}
              maxHeight={maxHeight}
              canChangeQuality={target?.kind === "page"}
              upscaling={upscaling}
              refining={upscaling && !enlarged}
              fullscreen={fullscreen}
              openMenu={openMenu}
              setOpenMenu={setOpenMenu}
              onModel={changeModel}
              onQuality={changeQuality}
              onFullscreen={() => toggleFullscreen()}
              onSettings={() => setShowSettings(true)}
            />
          </div>
        </>
      )}

      {(state.error || notice) && (
        <div className="absolute top-16 left-1/2 z-40 flex max-w-xl -translate-x-1/2 items-start gap-3 rounded-xl border border-red-500/30 bg-neutral-900/95 px-4 py-3 text-sm text-red-200 shadow-xl">
          <span className="break-all">{notice ?? `Lecture impossible : ${state.error}`}</span>
          <button onClick={() => { setNotice(null); dismissError(); }} className="text-neutral-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {showInstall && env?.extensionDir && (
        <InstallDialog extensionDir={env.extensionDir} installed={extensionInstalled} onClose={() => setShowInstall(false)} />
      )}

      {showSettings && settings && (
        <SettingsDialog settings={settings} env={env} onClose={() => setShowSettings(false)} onSave={saveSettings} />
      )}
    </div>
  );
}
