import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, LoaderCircle, X } from "lucide-react";
import { IconButton } from "./ui";

/**
 * Looks for a new release once per launch (GitHub latest.json, signed by the updater key) and
 * offers it on the welcome screen. Silent when offline, in dev, or when nothing is newer.
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    check()
      .then((u) => u && setUpdate(u))
      .catch(() => {});
  }, []);

  if (!update || hidden) return null;

  const install = async () => {
    setFailed(false);
    setProgress(0);
    let total = 0;
    let done = 0;
    try {
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        if (e.event === "Progress") {
          done += e.data.chunkLength;
          if (total) setProgress(Math.round((done / total) * 100));
        }
      });
      await relaunch();
    } catch {
      setProgress(null);
      setFailed(true);
    }
  };

  return (
    <div role="status" className="mt-6 flex items-center gap-3 rounded-panel border border-accent-text/30 bg-accent/10 py-2 ps-4 pe-1.5 text-sm">
      <span className="min-w-0 flex-1 text-ink">
        {failed ? t("update.failed") : t("update.available", { version: update.version })}
      </span>
      <button
        type="button"
        aria-disabled={progress !== null}
        onClick={() => progress === null && install()}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-control bg-accent px-3 text-xs font-medium text-accent-ink transition-colors hover:bg-accent-hover aria-disabled:opacity-70"
      >
        {progress !== null ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} strokeWidth={1.75} />}
        {progress !== null ? t("update.installing", { percent: progress }) : t("update.install")}
      </button>
      <IconButton aria-label={t("player.dismiss")} onClick={() => setHidden(true)}>
        <X size={15} strokeWidth={1.75} className="text-ink-muted" />
      </IconButton>
    </div>
  );
}
