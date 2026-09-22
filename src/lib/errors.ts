import type { LoadTarget } from "./types";

/**
 * Message for a failed load. mpv only says "loading failed"; the useful part is yt-dlp's own
 * error (kept by the netsucast.lua script) and what the extension reported with the cast.
 */
export function describeLoadError(mpvError: string, ytdlError: string, target: LoadTarget | null): string {
  if (!ytdlError) return `Lecture impossible : ${mpvError}`;

  if (/not a bot|Sign in to confirm/i.test(ytdlError)) {
    if (target?.cookieFile) {
      return "YouTube refuse la lecture malgré ta session. Vérifie que tu es connecté à YouTube dans ton navigateur, puis relance.";
    }
    const diag = target?.diag;
    const detail = !diag
      ? "le cast ne venait pas de l'extension"
      : diag.cookieError
        ? `le navigateur a refusé l'accès aux cookies (${diag.cookieError})`
        : `l'extension ${diag.extensionVersion ?? ""} n'a trouvé aucun cookie YouTube`;
    return `YouTube exige ta session (anti-robot), mais NetsuCast n'a reçu aucun cookie : ${detail}.`;
  }
  if (/Unsupported URL/i.test(ytdlError)) {
    return "Site non reconnu : lance la vidéo dans la page, puis caste avec le bouton NetsuCast sur la vidéo.";
  }
  if (/Private video|members-only|This video is available to/i.test(ytdlError)) {
    return "Vidéo privée ou réservée aux membres.";
  }
  return `Lecture impossible : ${ytdlError.replace(/^ERROR:\s*(\[[^\]]+\]\s*[^:]+:\s*)?/, "")}`;
}
