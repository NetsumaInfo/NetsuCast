import { command, init, setProperty } from "tauri-plugin-mpv-api";
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
  if (s.gpu === "nvidia") args.push("--d3d11-adapter=NVIDIA");
  if (s.subLangs.trim()) args.push(`--slang=${s.subLangs.trim()}`);
  if (env.shadersDir && s.model !== "off") args.push(`--glsl-shaders=${shaderPath(env, s.model)}`);
  return args;
}

function shaderPath(env: Environment, model: Exclude<Model, "off">): string {
  return `${env.shadersDir}\\ArtCNN_${model}.glsl`;
}

export async function startMpv(env: Environment, settings: Settings) {
  await init({
    path: env.mpvPath ?? "mpv",
    args: mpvArgs(env, settings),
    observedProperties: OBSERVED,
    ipcTimeoutMs: 5000,
  });
}

export async function applyModel(env: Environment, model: Model) {
  if (model === "off" || !env.shadersDir) {
    await command("change-list", ["glsl-shaders", "clr", ""]);
  } else {
    await command("change-list", ["glsl-shaders", "set", shaderPath(env, model)]);
  }
}

function ytdlFormat(maxHeight: number): string {
  if (!maxHeight) return "";
  const h = `[height<=?${maxHeight}]`;
  return `bestvideo*${h}+bestaudio/best${h}/bestvideo*+bestaudio/best`;
}

export async function load(target: LoadTarget, s: Settings, start?: number) {
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
