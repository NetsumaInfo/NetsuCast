import type { LoadTarget } from "./types";

/**
 * Message for a failed load. mpv only says "loading failed"; the useful part is yt-dlp's own
 * error, kept by the netsucast.lua script.
 */
export function describeLoadError(mpvError: string, ytdlError: string, target: LoadTarget | null): string {
  if (!ytdlError) return `Lecture impossible : ${mpvError}`;

  if (/not a bot|Sign in to confirm/i.test(ytdlError)) {
    return target?.cookieFile
      ? "YouTube refuse la lecture même avec ta session. Vérifie que tu es connecté à YouTube dans ton navigateur, puis relance."
      : "YouTube demande ta session, mais l'extension ne l'a pas envoyée. Recharge l'extension (page des extensions → ↻), actualise l'onglet YouTube, puis relance.";
  }
  if (/Unsupported URL/i.test(ytdlError)) {
    return "Site non reconnu : lance la vidéo dans la page, puis caste avec le bouton NetsuCast sur la vidéo.";
  }
  if (/Private video|members-only|This video is available to/i.test(ytdlError)) {
    return "Vidéo privée ou réservée aux membres.";
  }
  return `Lecture impossible : ${ytdlError.replace(/^ERROR:\s*(\[[^\]]+\]\s*[^:]+:\s*)?/, "")}`;
}
