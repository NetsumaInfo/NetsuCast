import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { command } from "tauri-plugin-mpv-api";
import { LoaderCircle, Plus, X } from "lucide-react";
import { Controls } from "./components/Controls";
import { SettingsDialog } from "./components/SettingsDialog";
import { Welcome } from "./components/Welcome";
import { usePlayer } from "./hooks/usePlayer";
import * as player from "./lib/player";
import { MODELS, type Environment, type LoadTarget, type Model, type Settings } from "./lib/types";

const HIDE_DELAY = 2500;
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
  const { state, dismissError } = usePlayer(ready);

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

  // --- loading -------------------------------------------------------------------------------
  // Casts can arrive at any time (even before mpv is up), so the latest values live in a ref.
  const live = useRef({ ready, settings, maxHeight, pending: null as LoadTarget | null });
  live.current = { ...live.current, ready, settings, maxHeight };

  const open = useCallback(async (t: LoadTarget, start?: number) => {
    const { ready, settings, maxHeight } = live.current;
    if (!ready || !settings) {
      live.current.pending = t;
      return;
    }
    setTarget(t);
    dismissError();
    try {
      await player.load(t, { ...settings, maxHeight }, start);
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
    const unCast = listen<LoadTarget>("cast", (e) => open(e.payload));
    const unDrop = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "drop" && e.payload.paths.length) open({ url: e.payload.paths[0], kind: "file" });
    });
    return () => {
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

  useEffect(() => {
    getCurrentWindow().setTitle(state.title && !state.idle ? `${state.title} — NetsuCast` : "NetsuCast");
  }, [state.title, state.idle]);

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
  const controlsVisible = active || state.pause || state.idle || openMenu !== null || showSettings;

  // --- actions -------------------------------------------------------------------------------
  const changeModel = useCallback((m: Model) => {
    setModel(m);
    if (env) player.applyModel(env, m);
  }, [env]);

  const changeQuality = (h: number) => {
    setMaxHeight(h);
    live.current.maxHeight = h;
    if (target?.kind === "page") open(target, state.timePos);
  };

  const saveSettings = async (next: Settings) => {
    await invoke("save_settings", { settings: next });
    if (ready) {
      if (next.model !== settings?.model) changeModel(next.model);
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
      if (!ready || state.idle) return;
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
  }, [ready, state.idle, state.volume, showSettings, openMenu, fullscreen, model, poke, toggleFullscreen, changeModel]);

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

  // ArtCNN only runs when the picture is drawn at least 1.3× larger than the source.
  const upscaling =
    model !== "off" &&
    state.videoHeight > 0 &&
    state.displayHeight > state.videoHeight * 1.3 &&
    state.displayWidth > state.videoWidth * 1.3;

  const playing = ready && !state.idle;

  return (
    <div
      className={`relative h-screen w-screen overflow-hidden select-none ${ready ? "" : "bg-neutral-950"} ${playing && !controlsVisible ? "cursor-none" : ""}`}
      onMouseMove={poke}
    >
      {!playing && (
        <div className="absolute inset-0 bg-neutral-950/40">
          <Welcome env={env} mpvError={mpvError} onOpen={(url) => open(targetFromInput(url))} />
        </div>
      )}

      {playing && (
        <>
          <div className="absolute inset-0" onClick={onSurfaceClick} onDoubleClick={onSurfaceDoubleClick} />

          <div className={`absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-5 pt-3 pb-10 transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <span className="truncate text-sm font-medium text-neutral-100">{state.title}</span>
            <div className="flex-1" />
            <span className="flex items-center gap-1.5 text-xs text-neutral-400" title="Récepteur de l'extension Chrome">
              <span className={`size-2 rounded-full ${env?.receiverError ? "bg-red-400" : "bg-emerald-400"}`} />
              Récepteur :{env?.receiverPort}
            </span>
            <button onClick={() => player.stop()} title="Nouvelle vidéo"
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20">
              <Plus size={14} /> Nouvelle vidéo
            </button>
          </div>

          {(state.loading || state.buffering) && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <LoaderCircle className="animate-spin text-white/80" size={48} />
            </div>
          )}

          <div className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <Controls
              state={state}
              model={model}
              maxHeight={maxHeight}
              canChangeQuality={target?.kind === "page"}
              upscaling={upscaling}
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

      {!playing && settings && (
        <button onClick={() => setShowSettings(true)}
          className="absolute top-4 right-4 rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:bg-white/10 hover:text-white">
          Paramètres
        </button>
      )}

      {showSettings && settings && (
        <SettingsDialog settings={settings} env={env} onClose={() => setShowSettings(false)} onSave={saveSettings} />
      )}
    </div>
  );
}
