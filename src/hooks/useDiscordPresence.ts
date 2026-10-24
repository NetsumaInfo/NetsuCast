// Feeds the Discord status (src-tauri/src/discord.rs): "Watching <title>", the episode, a progress
// bar, the show's cover that opens its page, and the NetsuCast badge.
// Sent on every meaningful change; the Rust side keeps only the latest and respects Discord's one
// update per 15 s, and Discord moves the progress bar on its own in between.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { PlayerState } from "./usePlayer";
import { describeMedia, type MediaInfo } from "../lib/media";
import * as player from "../lib/player";
import type { LoadTarget, Settings } from "../lib/types";

/** The app icon, for videos nothing better was found for and for the small badge. */
const APP_ICON = "https://raw.githubusercontent.com/NetsumaInfo/NetsuCast/main/src-tauri/icons/128x128@2x.png";
const REPO_URL = "https://github.com/NetsumaInfo/NetsuCast";
/** Discord refuses lines shorter than 2 or longer than 128 characters. */
const line = (text: string | null | undefined) => {
  const s = (text ?? "").trim();
  if (!s) return undefined;
  const padded = s.length < 2 ? `${s} ` : s;
  return padded.length > 128 ? `${padded.slice(0, 127)}…` : padded;
};
/** Activity types: 3 = Watching. status_display_type 2: the profile says "Watching <details>". */
const WATCHING = 3;
const SHOW_DETAILS = 2;

type Args = {
  settings: Settings | null;
  target: LoadTarget | null;
  state: PlayerState;
  playing: boolean;
};

export function useDiscordPresence({ settings, target, state, playing }: Args) {
  const { t, i18n } = useTranslation();
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const enabled = !!settings?.discordEnabled;

  // What is playing: looked up once per file, after mpv has opened it (yt-dlp's answer is there).
  const loaded = playing && !state.loading;
  useEffect(() => {
    if (!enabled || !target || !loaded) return;
    let stale = false;
    (async () => {
      const ytdl = target.kind === "page" ? await player.ytdlInfo() : null;
      const info = await describeMedia(target, state.title, ytdl, i18n.language);
      if (!stale) setMedia(info);
    })();
    return () => {
      stale = true;
    };
  }, [enabled, target, loaded, i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setMedia(null), [target]);

  // The bar's start and end move only on a seek, a speed change or a pause, not every second:
  // rounded to 2 s so that steady playback sends nothing new.
  const anchor = useRef(0);
  const startedAt = playing && !state.pause && state.speed > 0 ? Date.now() / 1000 - state.timePos / state.speed : 0;
  if (Math.abs(startedAt - anchor.current) > 2) anchor.current = startedAt;
  const start = startedAt ? Math.round(anchor.current) : 0;

  useEffect(() => {
    if (!enabled) return;
    if (!playing || !media) {
      invoke("discord_set_activity", { activity: null }).catch(() => {});
      return;
    }
    const s = settings!;
    const episode = [
      media.season ? t("discord.season", { n: media.season }) : null,
      media.episode ? t("discord.episode", { n: media.episode }) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const details = s.discordShowTitle ? line(media.title) : line(t("discord.watchingVideo"));
    const second = state.pause ? t("discord.paused") : s.discordShowTitle ? episode || media.by : null;
    const image = s.discordShowImage && s.discordShowTitle ? (media.image ?? APP_ICON) : APP_ICON;
    const activity: Record<string, unknown> = {
      type: WATCHING,
      status_display_type: SHOW_DETAILS,
      details,
      assets: {
        large_image: image,
        large_text: line(s.discordShowTitle ? media.title : "NetsuCast"),
        small_image: APP_ICON,
        small_text: "NetsuCast",
      },
    };
    const stateLine = line(second);
    if (stateLine) activity.state = stateLine;
    if (start && state.duration > 0) {
      activity.timestamps = { start, end: Math.round(start + state.duration / state.speed) };
    }
    if (s.discordLinks) {
      const assets = activity.assets as Record<string, unknown>;
      // The show's page (AniList, TMDB) where the others learn what it is, not the streaming
      // site; the video's own page only when the show was not recognised (a YouTube video).
      // Only with the title shown: a link would give it away.
      const link = media.infoUrl ?? media.pageUrl;
      if (s.discordShowTitle && link) {
        assets.large_url = link;
        activity.details_url = link;
      }
      assets.small_url = REPO_URL;
    }
    invoke("discord_set_activity", { activity }).catch(() => {});
  }, [enabled, playing, media, state.pause, state.duration, state.speed, start, settings, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // Turned off in the settings, or the app hides in the tray: the status goes.
  useEffect(() => {
    if (!enabled) invoke("discord_set_activity", { activity: null }).catch(() => {});
  }, [enabled]);
}
