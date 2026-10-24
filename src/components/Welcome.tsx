import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Cast, Check, Download, FileVideo, FolderOpen, Link2, Play, Plus, Settings as SettingsIcon, TriangleAlert } from "lucide-react";
import appIcon from "../../src-tauri/icons/128x128@2x.png";
import { modelName } from "../lib/upscaleInfo";
import type { Model } from "../lib/types";
import { IconButton, TextInput } from "./ui";
import { HeaderLinks } from "./HeaderLinks";
import { UpdateButton } from "./UpdateButton";

export type Warmup = { model: Model; index: number; total: number };

type Props = {
  mpvError: string | null;
  warmup: Warmup | null;
  onOpen: (url: string) => void;
  /** Picks a video file on the PC. */
  onOpenFile: () => void;
  /** A file is being dragged over the window. */
  dragging: boolean;
  onSettings?: () => void;
  /** Opens Settings ▸ About (donation pages). */
  onSupport?: () => void;
  extensionInstalled: boolean;
  onInstallExtension?: () => void;
};

export function Welcome({ mpvError, warmup, onOpen, onOpenFile, dragging, onSettings, onSupport, extensionInstalled, onInstallExtension }: Props) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const submit = () => url.trim() && onOpen(url.trim());

  return (
    <div className="relative flex h-full items-center justify-center p-8">
      <div className="absolute top-3 end-3 flex items-center gap-0.5">
        <UpdateButton />
        {onSupport && <HeaderLinks onSupport={onSupport} />}
        {onSettings && (
          <IconButton aria-label={t("player.settings")} onClick={onSettings}>
            <SettingsIcon size={18} strokeWidth={1.75} className="text-ink-muted" />
          </IconButton>
        )}
      </div>

      <div className="w-full max-w-lg">
        <div className="flex items-center gap-4">
          <img src={appIcon} alt="" width={64} height={64} className="size-16 shrink-0" draggable={false} />
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight" translate="no">
              Netsu<span className="text-accent-text">Cast</span>
            </h1>
            <p className="mt-1 text-sm text-ink-muted">{t("welcome.tagline")}</p>
          </div>
        </div>

        {mpvError && (
          <div role="alert" className="mt-6 flex gap-3 rounded-panel border border-danger/30 bg-danger/10 p-4 text-sm">
            <TriangleAlert className="mt-0.5 shrink-0 text-danger" size={17} />
            <div className="min-w-0">
              <div className="font-medium text-ink">{t("welcome.mpvErrorTitle")}</div>
              <div className="mt-1 break-all text-ink-muted">{mpvError}</div>
              <div className="mt-2 text-ink-muted">{t("welcome.mpvErrorHint")}</div>
            </div>
          </div>
        )}

        {warmup && (
          <div role="status" className="mt-6 rounded-panel border border-line bg-surface p-4 text-sm">
            <div className="text-ink">
              {t("welcome.warmupTitle", { index: warmup.index, total: warmup.total, model: modelName(warmup.model) })}
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full bg-accent-text transition-[width] duration-300"
                style={{ width: `${((warmup.index - 1) / warmup.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Main action: a video from the PC. The whole card is the button and the drop target. */}
        <button
          type="button"
          onClick={onOpenFile}
          disabled={!!mpvError}
          className={`group mt-8 flex w-full flex-col items-center gap-3 rounded-panel border border-dashed px-6 py-9 text-center transition-colors disabled:pointer-events-none disabled:opacity-50 ${
            dragging ? "border-accent-text bg-accent/10" : "border-line-strong/70 bg-surface hover:border-accent-text/70 hover:bg-accent/5"
          }`}
        >
          <span className={`grid size-12 place-items-center rounded-full transition-colors ${dragging ? "bg-accent text-accent-ink" : "bg-accent/15 text-accent-text group-hover:bg-accent/25"}`}>
            {dragging ? <FileVideo size={22} strokeWidth={1.75} /> : <FolderOpen size={22} strokeWidth={1.75} />}
          </span>
          <span className="text-base font-medium text-ink">{dragging ? t("welcome.dropNow") : t("welcome.openFile")}</span>
          <span className="text-sm text-ink-muted">{t("welcome.dropHint")}</span>
        </button>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="relative flex-1">
            <Link2 size={16} strokeWidth={1.75} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <TextInput
              id="nc-url"
              dir="ltr"
              aria-label={t("welcome.openLink")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("welcome.openLink")}
              className="ps-9"
            />
          </div>
          <button
            type="submit"
            aria-label={t("welcome.play")}
            data-tip={t("welcome.play")}
            disabled={!url.trim() || !!mpvError}
            className="grid size-9 shrink-0 place-items-center rounded-control bg-accent text-accent-ink transition-colors hover:bg-accent-hover disabled:bg-ink/10 disabled:text-ink-faint"
          >
            <Play size={15} fill="currentColor" strokeWidth={0} />
          </button>
        </form>

        <section className="mt-8 flex items-start gap-3 border-t border-line pt-6">
          <Cast size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent-text" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium text-ink">{t("welcome.castTitle")}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t("welcome.castBody")}</p>
            {onInstallExtension &&
              (extensionInstalled ? (
                <div className="mt-1.5 flex items-center gap-1 text-sm">
                  <span className="flex items-center gap-1.5 text-success">
                    <Check size={15} strokeWidth={2} /> {t("welcome.extensionInstalled")}
                  </span>
                  <IconButton aria-label={t("welcome.installOtherBrowser")} onClick={onInstallExtension}>
                    <Plus size={16} strokeWidth={1.75} className="text-ink-muted" />
                  </IconButton>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onInstallExtension}
                  className="mt-3 flex h-9 items-center gap-2 rounded-control bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
                >
                  <Download size={16} strokeWidth={1.75} /> {t("welcome.installExtension")}
                </button>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
