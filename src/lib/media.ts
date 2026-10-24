// What is being watched, for the Discord status: a title, the episode, a picture and the page
// a click on that picture opens. Built from what is at hand, best first:
// 1. what yt-dlp knows about the video (series, episode, thumbnail, page);
// 2. what the page said when the extension cast it (sharing title and picture, episode list);
// 3. the file name of a local file ("[Group] Show - 05 [1080p].mkv");
// then the show is looked up on AniList (anime) and TMDB (films and series), whose cover and page
// replace the video's own thumbnail. Not recognised: the video's thumbnail, else the app icon.
import type { LoadTarget } from "./types";

export type MediaInfo = {
  /** The show or the video. */
  title: string;
  season: number | null;
  episode: number | null;
  /** Channel or site, for videos that are not episodes of a show. */
  by: string | null;
  /** https picture: cover, else thumbnail. */
  image: string | null;
  /** Page of the show (AniList, TMDB), opened by a click on the picture. */
  infoUrl: string | null;
  /** Page of the video itself, opened by a click on the title. */
  pageUrl: string | null;
};

/** The subset of yt-dlp's JSON (mpv's user-data/mpv/ytdl/json-subprocess-result) used here. */
export type YtdlInfo = {
  title?: string;
  series?: string;
  season_number?: number;
  episode_number?: number;
  uploader?: string;
  channel?: string;
  thumbnail?: string;
  webpage_url?: string;
  extractor_key?: string;
};

/**
 * Key of NetsuCast's TMDB application (https://www.themoviedb.org/settings/api), read at build
 * time from VITE_TMDB_KEY in .env.local, which git ignores: the key stays out of the repository.
 * Builds without it (forks, CI) skip TMDB; AniList and the page's own picture still work.
 */
const TMDB_KEY: string = import.meta.env.VITE_TMDB_KEY ?? "";

/** Sites whose videos are not shows: their own thumbnail and channel say it all. */
const VIDEO_SITES = /^(Youtube|YoutubeTab|Twitch|TwitchVod|TwitchClips|Twitter|Reddit|TikTok|Instagram|Facebook|Streamable|Kick|Dailymotion|Vimeo)/i;

const number = (text: string | null | undefined, word: RegExp) => {
  const m = text ? word.exec(text) : null;
  return m ? Number(m[1]) : null;
};
const EPISODE = /(?:[ée]pisode|ep\.?|e)\s*0*(\d{1,4})\b/i;

// Words that say how a site serves the video, never part of a show's name.
const NOISE = /\b(?:regarder|voir|watch(?:ing)?|(?:en\s+)?stream(?:ing)?|en ligne|online|gratuit(?:ement)?|free|complet|full|hd|4k|1080p|720p|vostfr|vost|vf|french|sub(?:bed)?|dub(?:bed)?|multi|anime|film|movie|s[ée]rie|series|tv show|replay)\b/gi;

/**
 * The show's name in one of the page's titles, without the site's name, the "Episode 3" and
 * "Season 1" parts and the streaming noise: "Avatar : les Sept Refuges - Saison 1 | Anime-Sama -
 * Streaming et catalogage…" → "Avatar : les Sept Refuges". Null when nothing is left.
 */
export function showName(raw: string, site: string | null | undefined): string | null {
  const siteWords = normalize(site ?? "").split(" ").filter((w) => w.length > 2);
  const parts = raw.split(/\s[|·–—»]\s|\s-\s/).map((p) => p.trim());
  for (let part of parts) {
    part = part
      .replace(/\(\s*\d{4}\s*\)/g, " ")
      .replace(/\b(?:saison|season|staffel|temporada)\s*\d+.*$/i, " ")
      .replace(/\b(?:[ée]pisode|episode|ep\.?|folge|cap[ií]tulo)\s*\d+.*$/i, " ")
      .replace(/\bS\d{1,2}\s*E\d{1,4}.*$/i, " ")
      .replace(NOISE, " ")
      .replace(/^[\s:,.\-–]+|[\s:,.\-–]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (part.length < 2) continue;
    const words = normalize(part).split(" ");
    // The site's own name ("Anime-Sama", "Crunchyroll") is not the show.
    if (siteWords.length && words.every((w) => siteWords.some((s) => s.includes(w) || w.includes(s)))) continue;
    if (/^(?:accueil|home|lecteur|player)$/i.test(part)) continue;
    return part;
  }
  return null;
}

/** Season and episode written in a page's titles, its episode list or its address. */
function numbers(texts: (string | null | undefined)[], url: string | null | undefined) {
  let season: number | null = null;
  let episode: number | null = null;
  const path = url ? decodeURIComponent(url.replace(/^https?:\/\/[^/]+/, "")) : "";
  for (const text of [...texts, path]) {
    if (!text) continue;
    const se = /\bS(\d{1,2})\s*E(\d{1,4})\b/i.exec(text);
    season ??= se ? Number(se[1]) : number(text, /(?:saison|season|staffel|temporada)[\s_-]*0*(\d{1,2})\b/i);
    episode ??= se ? Number(se[2]) : number(text, /(?:[ée]pisode|episode|ep|folge|cap[ií]tulo)[\s._-]*0*(\d{1,4})\b/i);
  }
  return { season, episode };
}

/** "…/catalogue/avatar-les-sept-refuges/saison1/vf/" → "avatar les sept refuges". */
function slugName(url: string | null | undefined) {
  if (!url) return null;
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  const at = segments.findIndex((s) => /^(?:saison|season|s)[-_]?\d+$|^(?:episode|ep)[-_]?\d+$|^(?:vf|vostfr|vo|sub|dub)$/i.test(s));
  const slug = at > 0 ? segments[at - 1] : null;
  return slug && /[a-z]/i.test(slug) ? slug.replace(/[-_]+/g, " ").replace(/\b\d+$/, "").trim() : null;
}

/** "[SubsPlease] Sousou no Frieren - 05 (1080p) [ABCD1234].mkv" → title, season, episode. */
export function fromFileName(path: string) {
  let name = path.split(/[\\/]/).pop() ?? path;
  name = name.replace(/\.[a-z0-9]{2,4}$/i, "");
  name = name.replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, " ").replace(/[._]/g, " ");
  const se = /\bS(\d{1,2})E(\d{1,4})\b/i.exec(name);
  let season = se ? Number(se[1]) : number(name, /\b(?:saison|season)\s*0*(\d{1,2})\b/i);
  let episode = se ? Number(se[2]) : number(name, /\s-\s*0*(\d{1,4})(?:v\d)?\b/) ?? number(name, EPISODE);
  let title = name.split(/\s-\s*\d|\bS\d{1,2}E\d|\b(?:[ée]pisode|ep)\s*\d/i)[0];
  title = title.replace(/\b(?:1080p|720p|2160p|480p|x26[45]|hevc|web-?dl|bluray|multi|vostfr|vf)\b.*$/i, "");
  title = title.replace(/\s+/g, " ").trim();
  if (!season) season = null;
  if (!episode) episode = null;
  return { title, season, episode };
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Share of the searched title's words found in a candidate: guards against a wrong match. */
function close(searched: string, candidates: (string | null | undefined)[]) {
  const words = normalize(searched).split(" ").filter((w) => w.length > 1);
  if (!words.length) return false;
  return candidates.some((c) => {
    if (!c) return false;
    const found = new Set(normalize(c).split(" "));
    return words.filter((w) => found.has(w)).length / words.length >= 0.6;
  });
}

const cache = new Map<string, Promise<{ image: string; infoUrl: string } | null>>();

async function anilist(title: string) {
  const query = `query ($q: String) { Media(search: $q, type: ANIME) {
    siteUrl coverImage { extraLarge large } title { romaji english native } synonyms } }`;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { q: title } }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const m = (await res.json())?.data?.Media;
  if (!m || !close(title, [m.title?.romaji, m.title?.english, m.title?.native, ...(m.synonyms ?? [])])) return null;
  const image = m.coverImage?.extraLarge ?? m.coverImage?.large;
  return image ? { image, infoUrl: m.siteUrl as string, title: (m.title?.english || m.title?.romaji) as string } : null;
}

async function tmdb(title: string, language: string, kind: "movie" | "tv" | null) {
  if (!TMDB_KEY) return null;
  const url = `https://api.themoviedb.org/3/search/${kind ?? "multi"}?api_key=${TMDB_KEY}&language=${encodeURIComponent(language)}&query=${encodeURIComponent(title)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const hit = ((await res.json())?.results ?? []).find(
    (r: { media_type?: string; poster_path?: string }) => (kind || r.media_type === "movie" || r.media_type === "tv") && r.poster_path,
  );
  if (!hit || !close(title, [hit.title, hit.name, hit.original_title, hit.original_name])) return null;
  return {
    image: `https://image.tmdb.org/t/p/w500${hit.poster_path}`,
    infoUrl: `https://www.themoviedb.org/${kind ?? hit.media_type}/${hit.id}`,
    title: (hit.title ?? hit.name) as string,
  };
}

/** The show's cover and page: AniList first (anime), then TMDB. Cached per title. */
function lookup(title: string, language: string, kind: "movie" | "tv" | null = null) {
  const key = `${normalize(title)}|${language}|${kind}`;
  let found = cache.get(key);
  if (!found) {
    found = (async () => {
      try {
        // A page that says "movie" is not an anime series: TMDB only.
        return (kind === "movie" ? null : await anilist(title)) ?? (await tmdb(title, language, kind));
      } catch {
        return null; // offline, or a service down: the video's own picture stays
      }
    })();
    cache.set(key, found);
  }
  return found;
}

const https = (url: string | null | undefined) => (url && /^https:\/\//i.test(url) ? url : null);

/** `mediaTitle`: mpv's media-title. `language`: interface language, for TMDB's titles. */
export async function describeMedia(target: LoadTarget, mediaTitle: string, ytdl: YtdlInfo | null, language: string): Promise<MediaInfo> {
  const meta = target.meta ?? null;
  const webPage = target.kind === "file" ? null : (meta?.url ?? ytdl?.webpage_url ?? target.url);
  const isVideoSite = !!ytdl?.extractor_key && VIDEO_SITES.test(ytdl.extractor_key);

  let title = mediaTitle;
  let season: number | null = null;
  let episode: number | null = null;
  // Names to look the show up with, best first.
  const names: string[] = [];
  if (ytdl?.series) {
    names.push(ytdl.series);
    season = ytdl.season_number ?? null;
    episode = ytdl.episode_number ?? null;
  } else if (target.kind === "file") {
    const parsed = fromFileName(target.url);
    if (parsed.title) names.push(parsed.title);
    ({ season, episode } = parsed);
  } else if (meta && !isVideoSite) {
    if (meta.series) names.push(meta.series);
    for (const raw of meta.titles ?? []) {
      const name = showName(raw, meta.site);
      if (name) names.push(name);
    }
    const slug = slugName(meta.url);
    if (slug) names.push(slug);
    season = meta.season ?? null;
    episode = meta.episode ?? null;
    const found = numbers([meta.episodeText, ...(meta.titles ?? [])], meta.url);
    season ??= found.season;
    episode ??= found.episode ?? number(meta.episodeText, /^\s*0*(\d{1,4})\s*$/);
  } else if (ytdl?.title) {
    names.push(ytdl.title);
  }
  if (names.length) title = names[0];

  const own = https(ytdl?.thumbnail) ?? https(meta?.image);
  const info: MediaInfo = {
    title: title || mediaTitle,
    season,
    episode,
    by: isVideoSite ? (ytdl?.channel ?? ytdl?.uploader ?? null) : null,
    image: own,
    infoUrl: null,
    pageUrl: https(webPage),
  };
  if (!isVideoSite) {
    // Each candidate, then its part before a subtitle ("Show: The Movie" → "Show"), until one is
    // recognised.
    const tries = [...new Set(names.flatMap((n) => [n, n.split(/\s*[:–—]\s|\s-\s/)[0]]).map((n) => n.trim()).filter((n) => n.length > 1))];
    for (const name of tries.slice(0, 5)) {
      const show = await lookup(name, language, meta?.kind ?? null);
      if (!show) continue;
      // The cover and the page; the title stays the one the page gave, in the user's language.
      Object.assign(info, { image: show.image, infoUrl: show.infoUrl });
      break;
    }
  }
  return info;
}
