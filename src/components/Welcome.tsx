import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Cast, Check, Download, FileVideo, Play, Settings as SettingsIcon, TriangleAlert } from "lucide-react";
import { modelName } from "../lib/upscaleInfo";
import type { Model } from "../lib/types";
import { IconButton, TextInput } from "./ui";
import { UpdateBanner } from "./UpdateBanner";

export type Warmup = { model: Model; index: number; total: number };

type Props = {
  mpvError: string | null;
  warmup: Warmup | null;
  onOpen: (url: string) => void;
  onSettings?: () => void;
  extensionInstalled: boolean;
  onInstallExtension?: () => void;
};

export function Welcome({ mpvError, warmup, onOpen, onSettings, extensionInstalled, onInstallExtension }: Props) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const submit = () => url.trim() && onOpen(url.trim());

  return (
    <div className="relative flex h-full items-center justify-center p-8">
      {onSettings && (
        <div className="absolute top-3 end-3">
          <IconButton aria-label={t("player.settings")} onClick={onSettings}>
            <SettingsIcon size={18} strokeWidth={1.75} className="text-ink-muted" />
          </IconButton>
        </div>
      )}

      <div className="w-full max-w-lg">
        <h1 className="text-3xl font-semibold tracking-tight" translate="no">
          Netsu<span className="text-accent-text">Cast</span>
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">{t("welcome.tagline")}</p>

        <UpdateBanner />

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
            <div className="mt-1 text-ink-muted">{t("welcome.warmupBody")}</div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full bg-accent-text transition-[width] duration-300"
                style={{ width: `${((warmup.index - 1) / warmup.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        <section className="mt-8 border-t border-line pt-6">
          <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
            <Cast size={17} strokeWidth={1.75} className="text-accent-text" /> {t("welcome.castTitle")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t("welcome.castBody")}</p>
          {onInstallExtension &&
            (extensionInstalled ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="flex items-center gap-1.5 text-success">
                  <Check size={15} strokeWidth={2} /> {t("welcome.extensionInstalled")}
                </span>
                <button
                  type="button"
                  onClick={onInstallExtension}
                  className="text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
                >
                  {t("welcome.installOtherBrowser")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onInstallExtension}
                className="mt-4 flex h-9 items-center gap-2 rounded-control bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
              >
                <Download size={16} strokeWidth={1.75} /> {t("welcome.installExtension")}
              </button>
            ))}
        </section>

        <form
          className="mt-8 border-t border-line pt-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="nc-url" className="text-sm font-medium text-ink">
            {t("welcome.openLink")}
          </label>
          <div className="mt-2 flex gap-2">
            <TextInput
              id="nc-url"
              dir="ltr"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="flex-1"
            />
            <button
              type="submit"
              disabled={!url.trim() || !!mpvError}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-line-strong/70 px-3.5 text-sm text-ink transition-colors hover:bg-white/8 disabled:opacity-40"
            >
              <Play size={14} fill="currentColor" strokeWidth={0} /> {t("welcome.play")}
            </button>
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-ink-faint">
            <FileVideo size={14} strokeWidth={1.75} /> {t("welcome.dropHint")}
          </p>
        </form>
      </div>
    </div>
  );
}
