export const MODELS = ["off", "C4F16", "C4F16_DS", "C4F32", "C4F32_DS"] as const;
export type Model = (typeof MODELS)[number];

export const MODEL_LABELS: Record<Model, string> = {
  off: "Désactivé",
  C4F16: "C4F16 · rapide",
  C4F16_DS: "C4F16 DS · rapide, débruité",
  C4F32: "C4F32 · qualité",
  C4F32_DS: "C4F32 DS · qualité, débruité",
};

/** Max source height requested from yt-dlp. 0 = best available. */
export const QUALITIES = [0, 2160, 1440, 1080, 720, 480] as const;

export type Settings = {
  defaultsVersion: number;
  model: Model;
  forceUpscale: boolean;
  maxHeight: number;
  hwdec: "auto-safe" | "no";
  deband: boolean;
  subLangs: string;
  autoSubs: boolean;
  volume: number;
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

export function qualityLabel(height: number): string {
  if (height === 0) return "Meilleure";
  if (height === 2160) return "4K (2160p)";
  return `${height}p`;
}

export function trackLabel(track: Track): string {
  const parts = [track.title, track.lang?.toUpperCase()].filter(Boolean);
  return parts.length ? parts.join(" · ") : `Piste ${track.id}`;
}

export function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "0:00";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
