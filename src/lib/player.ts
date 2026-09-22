import { command, getProperty, init, setProperty } from "tauri-plugin-mpv-api";
import type { Environment, LoadTarget, Model, Settings } from "./types";

export const OBSERVED = [
  "pause",
  "time-pos",
  "duration",
  "volume",
  "mute",
  "speed",
  "track-list",
  "media-title",
  "idle-active",
  "paused-for-cache",
  "demuxer-cache-time",
  "width",
  "height",
  "osd-dimensions",
] as const;

// mpv's own default ("libmpv") gets refused by some CDNs. Replaced by the browser's own
// User-Agent whenever the extension sends one.
const FALLBACK_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/**
 * The NetsuCast mpv profile. `--profile=libmpv` (added by the plugin) turns ytdl off and keeps
 * mpv from reading any user config, so everything the player relies on is set here.
 */
function mpvArgs(env: Environment, s: Settings): string[] {
  const args = [
    "--vo=gpu-next",
    // Vulkan compiles the ArtCNN shaders in seconds; Direct3D 11 needs minutes per model.
    // libplacebo also picks the discrete GPU on its own, which matters on hybrid laptops.
    "--gpu-api=vulkan",
    "--profile=high-quality",
    "--ytdl=yes",
    "--keep-open=yes",
    "--force-window=yes",
    "--idle=yes",
    "--cache=yes",
    "--sub-auto=fuzzy",
    "--osd-level=0",
    `--hwdec=${s.hwdec}`,
    `--deband=${s.deband ? "yes" : "no"}`,
    `--volume=${s.volume}`,
    `--user-agent=${FALLBACK_USER_AGENT}`,
  ];
  if (env.ytdlpPath) args.push(`--script-opts=ytdl_hook-ytdl_path=${env.ytdlpPath}`);
  if (env.shaderCacheDir) args.push("--gpu-shader-cache=yes", `--gpu-shader-cache-dir=${env.shaderCacheDir}`);
  if (env.mpvLog) args.push(`--log-file=${env.mpvLog}`);
  if (s.subLangs.trim()) args.push(`--slang=${s.subLangs.trim()}`);
  const shader = shaderPath(env, s.model, s.forceUpscale);
  if (shader) args.push(`--glsl-shaders=${shader}`);
  return args;
}

function shaderPath(env: Environment, model: Model, force: boolean): string | null {
  const dir = force ? (env.forcedShadersDir ?? env.shadersDir) : env.shadersDir;
  return model === "off" || !dir ? null : `${dir}\\ArtCNN_${model}.glsl`;
}

export async function startMpv(env: Environment, settings: Settings) {
  await init({
    path: env.mpvPath ?? "mpv",
    args: mpvArgs(env, settings),
    observedProperties: OBSERVED,
    ipcTimeoutMs: 5000,
  });
}

export async function applyModel(env: Environment, model: Model, force: boolean) {
  const shader = shaderPath(env, model, force);
  if (shader) await command("change-list", ["glsl-shaders", "set", shader]);
  else await command("change-list", ["glsl-shaders", "clr", ""]);
}

type Pass = { desc?: string };

/**
 * Resolves once mpv has rendered a frame through `model`. Compiling an ArtCNN shader freezes
 * the renderer (up to minutes the very first time, ~1 s once cached), so the UI waits on this.
 * IPC calls time out while the renderer is busy: those failures just mean "not yet".
 */
export async function waitForModel(model: Model, timeoutMs = 600_000): Promise<boolean> {
  if (model === "off") return true;
  const prefix = `ArtCNN ${model.replace("_", " ")} (`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const passes = (await getProperty("vo-passes")) as { fresh?: Pass[]; redraw?: Pass[] } | null;
      const all = [...(passes?.fresh ?? []), ...(passes?.redraw ?? [])];
      if (all.some((p) => p.desc?.startsWith(prefix))) return true;
    } catch {
      // renderer busy compiling
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** Tiny black clip used to compile shaders while the welcome screen covers the video. */
export const WARMUP_SOURCE = "av://lavfi:color=c=black:s=320x180:r=24:d=36000";

const WARMED_KEY = "netsucast.warmedModels.v1";
const warmKey = (model: Model, force: boolean) => `${model}:${force ? "forced" : "normal"}`;

export function isWarmed(model: Model, force: boolean): boolean {
  if (model === "off") return true;
  try {
    return (JSON.parse(localStorage.getItem(WARMED_KEY) ?? "[]") as string[]).includes(warmKey(model, force));
  } catch {
    return false;
  }
}

export function markWarmed(model: Model, force: boolean) {
  try {
    const list = new Set(JSON.parse(localStorage.getItem(WARMED_KEY) ?? "[]") as string[]);
    list.add(warmKey(model, force));
    localStorage.setItem(WARMED_KEY, JSON.stringify([...list]));
  } catch {
    // storage unavailable: models will just be re-checked next time
  }
}

function ytdlFormat(maxHeight: number): string {
  if (!maxHeight) return "";
  const h = `[height<=?${maxHeight}]`;
  return `bestvideo*${h}+bestaudio/best${h}/bestvideo*+bestaudio/best`;
}

export async function load(target: LoadTarget, env: Environment, s: Settings, start = target.start ?? undefined) {
  // Headers are global mpv options: reset them on every load so one site's cookies never leak
  // into the next request.
  const h = target.headers ?? {};
  await setProperty("referrer", h.referer ?? "");
  await setProperty("user-agent", h.userAgent || FALLBACK_USER_AGENT);
  await setProperty("http-header-fields", h.cookie ? [`Cookie: ${h.cookie}`] : []);

  await setProperty("ytdl-format", ytdlFormat(s.maxHeight));
  await command("change-list", ["ytdl-raw-options", "clr", ""]);
  const langs = s.subLangs
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `${l}.*`)
    .join(",");
  if (langs) await command("change-list", ["ytdl-raw-options", "append", `sub-langs=${langs}`]);
  if (s.autoSubs) await command("change-list", ["ytdl-raw-options", "append", "write-auto-subs="]);
  // YouTube needs a JavaScript runtime (player challenges) and the signed-in session (bot check).
  if (env.denoPath) await command("change-list", ["ytdl-raw-options", "append", `js-runtimes=deno:${env.denoPath}`]);
  if (target.cookieFile) await command("change-list", ["ytdl-raw-options", "append", `cookies=${target.cookieFile}`]);

  // `ytdl://` sends page URLs straight to yt-dlp instead of first letting ffmpeg fail on HTML.
  const url = target.kind === "page" ? `ytdl://${target.url}` : target.url;
  const args: unknown[] = [url, "replace"];
  if (start && start > 1) args.push(-1, `start=${Math.floor(start)}`);
  await command("loadfile", args);
}

export const togglePause = () => command("cycle", ["pause"]);
export const seekRelative = (seconds: number) => command("seek", [seconds, "relative+exact"]);
export const seekAbsolute = (seconds: number) => command("seek", [seconds, "absolute"]);
export const setVolume = (volume: number) => setProperty("volume", Math.max(0, Math.min(130, volume)));
export const toggleMute = () => command("cycle", ["mute"]);
export const setSpeed = (speed: number) => setProperty("speed", speed);
export const setSub = (id: number | "no") => setProperty("sid", id);
export const setAudio = (id: number) => setProperty("aid", id);
export const setDeband = (on: boolean) => setProperty("deband", on);
export const setHwdec = (value: string) => setProperty("hwdec", value);
export const setSlang = (value: string) => setProperty("slang", value.split(",").map((l) => l.trim()).filter(Boolean));
export const toggleStats = () => command("script-binding", ["stats/display-stats-toggle"]);
export const stop = () => command("stop", []);
