import { useEffect, useState } from "react";
import { command, listenEvents, observeProperties } from "tauri-plugin-mpv-api";
import { OBSERVED } from "../lib/player";
import type { Track } from "../lib/types";

export type PlayerState = {
  pause: boolean;
  timePos: number;
  duration: number;
  volume: number;
  mute: boolean;
  speed: number;
  tracks: Track[];
  title: string;
  idle: boolean;
  buffering: boolean;
  loading: boolean;
  cacheTime: number;
  videoWidth: number;
  videoHeight: number;
  /** Size the video is actually drawn at (window minus black bars). */
  displayWidth: number;
  displayHeight: number;
  error: string | null;
};

const INITIAL: PlayerState = {
  pause: false,
  timePos: 0,
  duration: 0,
  volume: 100,
  mute: false,
  speed: 1,
  tracks: [],
  title: "",
  idle: true,
  buffering: false,
  loading: false,
  cacheTime: 0,
  videoWidth: 0,
  videoHeight: 0,
  displayWidth: 0,
  displayHeight: 0,
  error: null,
};

/** Turns yt-dlp's last error into something readable; mpv itself only says "loading failed". */
function explain(ytdlError: string | null, fallback: string): string {
  if (!ytdlError) return fallback;
  if (/not a bot|Sign in to confirm/i.test(ytdlError)) {
    return "YouTube demande d'être connecté : relance la vidéo depuis l'extension (elle transmet ta session YouTube).";
  }
  if (/Unsupported URL/i.test(ytdlError)) return "Ce site n'est pas reconnu : lance la vidéo dans la page puis caste le flux détecté.";
  if (/Private video|members-only|This video is available to/i.test(ytdlError)) return "Vidéo privée ou réservée aux membres.";
  return ytdlError.replace(/^ERROR:\s*(\[[^\]]+\]\s*[^:]+:\s*)?/, "");
}

type OsdDimensions = { w: number; h: number; ml: number; mr: number; mt: number; mb: number };

/** Mirrors the mpv properties the UI needs. Only active once `ready` (mpv started). */
export function usePlayer(ready: boolean) {
  const [state, setState] = useState<PlayerState>(INITIAL);

  useEffect(() => {
    if (!ready) return;
    const patch = (p: Partial<PlayerState>) => setState((s) => ({ ...s, ...p }));

    const props = observeProperties(OBSERVED, ({ name, data }) => {
      const d = data as unknown;
      switch (name) {
        case "pause": return patch({ pause: Boolean(d) });
        case "time-pos": return patch({ timePos: (d as number) ?? 0 });
        case "duration": return patch({ duration: (d as number) ?? 0 });
        case "volume": return patch({ volume: (d as number) ?? 100 });
        case "mute": return patch({ mute: Boolean(d) });
        case "speed": return patch({ speed: (d as number) ?? 1 });
        case "track-list": return patch({ tracks: (d as Track[]) ?? [] });
        case "media-title": return patch({ title: (d as string) ?? "" });
        case "idle-active": return patch({ idle: Boolean(d) });
        case "paused-for-cache": return patch({ buffering: Boolean(d) });
        case "demuxer-cache-time": return patch({ cacheTime: (d as number) ?? 0 });
        case "width": return patch({ videoWidth: (d as number) ?? 0 });
        case "height": return patch({ videoHeight: (d as number) ?? 0 });
        case "osd-dimensions": {
          const o = d as OsdDimensions | null;
          if (!o) return;
          return patch({ displayWidth: o.w - o.ml - o.mr, displayHeight: o.h - o.mt - o.mb });
        }
      }
    });

    // Errors only: enough to explain a failed load without flooding the IPC channel.
    command("request_log_messages", ["error"]).catch(() => {});
    let ytdlError: string | null = null;

    const events = listenEvents((e) => {
      const ev = e as { event?: string; reason?: string; file_error?: string; prefix?: string; text?: string };
      if (ev.event === "log-message" && ev.prefix === "ytdl_hook" && ev.text?.startsWith("ERROR")) {
        ytdlError = ev.text.trim();
      }
      if (ev.event === "start-file") {
        ytdlError = null;
        patch({ loading: true, error: null });
      }
      if (ev.event === "file-loaded" || ev.event === "playback-restart") patch({ loading: false });
      if (ev.event === "end-file") {
        patch({ loading: false });
        if (ev.reason === "error") patch({ error: explain(ytdlError, ev.file_error ?? "lecture impossible") });
      }
    });

    return () => {
      props.then((u) => u());
      events.then((u) => u());
    };
  }, [ready]);

  const dismissError = () => setState((s) => ({ ...s, error: null }));
  return { state, dismissError };
}
