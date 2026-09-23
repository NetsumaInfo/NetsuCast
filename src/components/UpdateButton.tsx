import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import { downloadUpdate, installUpdate, scheduleLaunchCheck, updaterAvailable, useUpdater } from "../lib/updater";

/**
 * Updating in one button, shown only when a version really exists: download icon → progress
 * ring → "Update" pill that restarts the app. "Up to date", "checking" and failures stay in
 * Settings ▸ Updates: a button always present would only add noise.
 */
export function UpdateButton() {
  const { t, i18n } = useTranslation();
  const { phase, version, progress } = useUpdater();

  useEffect(() => scheduleLaunchCheck(), []);

  const busy = phase === "downloading" || phase === "installing";
  const ready = phase === "downloaded" || phase === "staged";
  if (!updaterAvailable() || (phase !== "available" && !busy && !ready)) return null;

  // One decimal: on a big download a rounded integer stays still for seconds, then jumps.
  const percent =
    progress == null
      ? null
      : new Intl.NumberFormat(i18n.language, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(progress / 100);
  const action = t("update.action");
  const tip = ready
    ? `${action} · ${phase === "staged" ? t("update.staged", { version }) : t("update.downloaded")}`
    : phase === "installing"
      ? t("update.installing")
      : phase === "downloading"
        ? `${t("update.downloading")} ${percent ?? ""}`.trim()
        : `${action} · v${version}`;

  return (
    <button
      type="button"
      aria-label={tip}
      data-tip={tip}
      aria-disabled={busy || undefined}
      onClick={ready ? () => void installUpdate() : phase === "available" ? () => void downloadUpdate() : undefined}
      className={`flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-control px-2.5 text-xs font-medium transition-colors ${
        ready ? "bg-accent text-accent-ink hover:bg-accent-hover" : "text-accent-text hover:bg-ink/12"
      }`}
    >
      {phase === "downloading" && progress != null ? (
        // A conic gradient: no animation loop running while the video plays.
        <span
          className="grid size-4 place-items-center rounded-full"
          style={{ background: `conic-gradient(var(--color-accent-text) ${progress}%, var(--color-line-strong) 0)` }}
        >
          <span className="size-2.5 rounded-full bg-page" />
        </span>
      ) : phase === "installing" || phase === "downloading" ? (
        <LoaderCircle size={16} className="animate-spin" />
      ) : ready ? (
        <RefreshCw size={16} strokeWidth={1.75} />
      ) : (
        <Download size={18} strokeWidth={1.75} />
      )}
      {(ready || busy) && <span className="tabular-nums">{ready ? action : phase === "installing" ? t("update.installing") : percent}</span>}
    </button>
  );
}
