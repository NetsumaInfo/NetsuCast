import { command, getProperty, init, setProperty } from "tauri-plugin-mpv-api";
import type { Environment, LoadTarget, Model, Settings, UpscaleScale } from "./types";

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
  "user-data/netsucast/ytdl-error",
  "video-codec",
  "estimated-vf-fps",
  "hwdec-current",
  "frame-drop-count",
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
  if (env.scriptPath) args.push(`--scripts=${env.scriptPath}`);
  if (env.mpvLog) args.push(`--log-file=${env.mpvLog}`);
  if (s.subLangs.trim()) args.push(`--slang=${s.subLangs.trim()}`);
  const shaders = shaderList(env, { model: s.model, force: s.forceUpscale, scale: s.upscaleScale });
  // Path lists are separated by ";" on Windows.
  if (shaders.length) args.push(`--glsl-shaders=${shaders.join(";")}`);
  return args;
}

/** What drives the ArtCNN shader stack. */
export type Upscale = { model: Model; force: boolean; scale: UpscaleScale };

/**
 * The shader stack for an upscale config:
 * - first pass: the "forced" copy (runs on every frame) or the original (runs only when the
 *   picture is enlarged at least 1.3×);
 * - with scale "auto", a second original copy: it only runs when the window is still 1.3×
 *   bigger than the ×2 result, turning 540p on a 4K screen into a ×4.
 */
function shaderList(env: Environment, { model, force, scale }: Upscale): string[] {
  if (model === "off" || !env.shadersDir) return [];
  const file = `ArtCNN_${model}.glsl`;
  const first = `${force ? (env.forcedShadersDir ?? env.shadersDir) : env.shadersDir}\\${file}`;
  return scale === "auto" ? [first, `${env.shadersDir}\\${file}`] : [first];
}

export async function startMpv(env: Environment, settings: Settings) {
  await init({
    path: env.mpvPath ?? "mpv",
    args: mpvArgs(env, settings),
    observedProperties: OBSERVED,
    ipcTimeoutMs: 5000,
  });
}

export async function applyUpscale(env: Environment, upscale: Upscale) {
  await setProperty("glsl-shaders", shaderList(env, upscale));
}

type Pass = { desc?: string; avg?: number };
type Passes = { fresh?: Pass[]; redraw?: Pass[] } | null;

/** What the GPU actually ran on the last frames, read from mpv's render pass statistics. */
export type UpscaleStatus = {
  /** ArtCNN passes run per frame: 1 = ×2, 2 = ×4, 0 = not running. */
  passes: number;
  /** GPU time spent in ArtCNN per frame, ms. */
  artcnnMs: number;
  /** GPU time for the whole frame, ms. */
  frameMs: number;
};

export async function readUpscaleStatus(): Promise<UpscaleStatus | null> {
  const passes = (await getProperty("vo-passes")) as Passes;
  const fresh = passes?.fresh ?? [];
  if (!fresh.length) return null; // paused: nothing rendered lately
  const artcnn = fresh.filter((p) => p.desc?.startsWith("ArtCNN"));
  const ms = (list: Pass[]) => list.reduce((sum, p) => sum + (p.avg ?? 0), 0) / 1e6;
  return {
    // Every ArtCNN shader starts with exactly one "(Conv2D)" pass.
    passes: artcnn.filter((p) => p.desc?.endsWith("(Conv2D)")).length,
    artcnnMs: ms(artcnn),
    frameMs: ms(fresh),
  };
}

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
      const passes = (await getProperty("vo-passes")) as Passes;
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
const warmKey = ({ model, force, scale }: Upscale) => `${model}:${force ? "forced" : "normal"}:${scale}`;

export function isWarmed(upscale: Upscale): boolean {
  if (upscale.model === "off") return true;
  try {
    return (JSON.parse(localStorage.getItem(WARMED_KEY) ?? "[]") as string[]).includes(warmKey(upscale));
  } catch {
    return false;
  }
}

export function markWarmed(upscale: Upscale) {
  try {
    const list = new Set(JSON.parse(localStorage.getItem(WARMED_KEY) ?? "[]") as string[]);
    list.add(warmKey(upscale));
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
  // pause persists across files: a cast must start playing even if the last video was paused.
  await setProperty("pause", false);
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
