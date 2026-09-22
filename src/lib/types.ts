export const MODELS = ["off", "C4F16", "C4F16_DS", "C4F32", "C4F32_DS"] as const;
export type Model = (typeof MODELS)[number];

export type UpscaleScale = "auto" | "x2";

/** Max source height requested from yt-dlp. 0 = best available. */
export const QUALITIES = [0, 2160, 1440, 1080, 720, 480] as const;

export type Settings = {
  defaultsVersion: number;
  model: Model;
  forceUpscale: boolean;
  upscaleScale: UpscaleScale;
  maxHeight: number;
  hwdec: "auto-safe" | "no";
  deband: boolean;
  subLangs: string;
  autoSubs: boolean;
  volume: number;
  language: string;
  seekStep: number;
  resumePosition: boolean;
  fullscreenOnCast: boolean;
  alwaysOnTop: boolean;
  subScale: number;
  audioLangs: string;
  receiverPort: number;
  mpvPath: string;
  ytdlpPath: string;
};

export type Environment = {
  mpvPath: string | null;
  ytdlpPath: string | null;
  denoPath: string | null;
  shadersDir: string | null;
  scriptPath: string | null;
  forcedShadersDir: string | null;
  shaderCacheDir: string | null;
  extensionDir: string | null;
  mpvLog: string | null;
  receiverPort: number;
  receiverError: string | null;
};

/** What to play. Mirrors the receiver's CastRequest, plus local files. */
export type LoadTarget = {
  url: string;
  kind: "stream" | "page" | "file";
  title?: string | null;
  /** Where the browser was in the video, in seconds. */
  start?: number | null;
  /** Netscape cookie file with the site session, for yt-dlp. */
  cookieFile?: string | null;
  /** What the extension saw when it sent the cast. */
  diag?: { extensionVersion?: string | null; cookiesFound?: number | null; cookieError?: string | null } | null;
  headers?: { referer?: string | null; userAgent?: string | null; cookie?: string | null };
};

export type Track = {
  id: number;
  type: "video" | "audio" | "sub";
  title?: string;
  lang?: string;
  codec?: string;
  selected?: boolean;
  external?: boolean;
  default?: boolean;
};

/** Labels that need the translator: pass `t` from useTranslation(). */
type T = (key: string, options?: Record<string, unknown>) => string;

export const modelLabel = (t: T, model: Model) => t(`models.${model}`);
export const scaleLabel = (t: T, scale: UpscaleScale, short = false) => t(`scale.${scale}${short ? "Short" : ""}`);

export function qualityLabel(t: T, height: number): string {
  if (height === 0) return t("quality.best");
  if (height === 2160) return t("quality.uhd");
  return t("quality.height", { height });
}

export function trackLabel(t: T, track: Track): string {
  const parts = [track.title, track.lang?.toUpperCase()].filter(Boolean);
  return parts.length ? parts.join(" · ") : t("player.trackNumber", { id: track.id });
}

export function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "0:00";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
