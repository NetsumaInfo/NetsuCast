import { useEffect, useState } from "react";
import { listenEvents, observeProperties } from "tauri-plugin-mpv-api";
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
  /** Last yt-dlp error, kept by the netsucast.lua mpv script. */
  ytdlError: string;
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
  ytdlError: "",
};

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
        case "user-data/netsucast/ytdl-error": return patch({ ytdlError: (d as string) ?? "" });
        case "osd-dimensions": {
          const o = d as OsdDimensions | null;
          if (!o) return;
          return patch({ displayWidth: o.w - o.ml - o.mr, displayHeight: o.h - o.mt - o.mb });
        }
      }
    });

    const events = listenEvents((e) => {
      const ev = e as { event?: string; reason?: string; file_error?: string };
      if (ev.event === "start-file") patch({ loading: true, error: null });
      if (ev.event === "file-loaded" || ev.event === "playback-restart") patch({ loading: false });
      if (ev.event === "end-file") {
        patch({ loading: false });
        if (ev.reason === "error") patch({ error: ev.file_error ?? "lecture impossible" });
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
