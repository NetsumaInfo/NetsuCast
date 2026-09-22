import i18n from "../i18n";
import type { LoadTarget } from "./types";

/**
 * Message for a failed load. mpv only says "loading failed"; the useful part is yt-dlp's own
 * error (kept by the netsucast.lua script) and what the extension reported with the cast.
 */
export function describeLoadError(mpvError: string, ytdlError: string, target: LoadTarget | null): string {
  const t = i18n.t.bind(i18n);
  if (!ytdlError) return t("errors.generic", { reason: mpvError });

  if (/not a bot|Sign in to confirm/i.test(ytdlError)) {
    if (target?.cookieFile) return t("errors.ytBotWithCookies");
    const diag = target?.diag;
    const detail = !diag
      ? t("errors.detailNotExtension")
      : diag.cookieError
        ? t("errors.detailCookieError", { error: diag.cookieError })
        : t("errors.detailNoCookies", { version: diag.extensionVersion ?? "" });
    return t("errors.ytBotNoCookies", { detail });
  }
  if (/Unsupported URL/i.test(ytdlError)) return t("errors.unsupported");
  if (/Private video|members-only|This video is available to/i.test(ytdlError)) return t("errors.private");
  return t("errors.generic", { reason: ytdlError.replace(/^ERROR:\s*(\[[^\]]+\]\s*[^:]+:\s*)?/, "") });
}
