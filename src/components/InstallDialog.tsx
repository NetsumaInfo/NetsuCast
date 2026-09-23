import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Check, ClipboardCopy, ExternalLink, LoaderCircle, X } from "lucide-react";
import { IconButton } from "./ui";

type Browser = { id: string; name: string; extensionsUrl: string; supported: boolean };

type Props = {
  extensionDir: string;
  installed: boolean;
  onClose: () => void;
};

export function InstallDialog({ extensionDir, installed, onClose }: Props) {
  const { t } = useTranslation();
  const [browsers, setBrowsers] = useState<Browser[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<Browser[]>("list_browsers").then((list) => {
      // Browsers NetsuCast cannot install into (Firefox) are left out rather than shown greyed.
      const supported = list.filter((b) => b.supported);
      setBrowsers(supported);
      setSelected(supported[0]?.id ?? null);
    });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    dialog.current?.querySelector<HTMLElement>("button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const browser = browsers?.find((b) => b.id === selected);
  // Button names differ slightly between Chromium browsers.
  const edgeLike = selected === "edge" || selected === "opera" || selected === "opera-gx";
  const labels = {
    dev: selected === "edge" ? t("install.devModeEdge") : t("install.devMode"),
    where: selected === "edge" ? t("install.whereLeftBottom") : t("install.whereTopRight"),
    load: edgeLike ? t("install.loadUnpackedEdge") : t("install.loadUnpacked"),
    select: t("install.selectFolder"),
  };

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(extensionDir);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const start = async () => {
    if (!browser) return;
    setError(null);
    await copyPath();
    try {
      await invoke("open_browser_extensions", { id: browser.id });
      setOpened(true);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-black/60 p-6" onMouseDown={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nc-install-title"
        className="w-full max-w-md overflow-hidden rounded-panel border border-line bg-surface shadow-overlay"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between ps-5 pe-2 pt-2">
          <h2 id="nc-install-title" className="text-base font-semibold text-ink">
            {t("welcome.installExtension")}
          </h2>
          <IconButton aria-label={t("install.close")} shortcut={t("keys.escape")} onClick={onClose}>
            <X size={17} strokeWidth={1.75} className="text-ink-muted" />
          </IconButton>
        </div>

        <div className="grid gap-5 px-5 pt-2 pb-5 text-sm">
          {installed && (
            <div role="status" className="flex items-center gap-2 rounded-control bg-success/10 px-3 py-2.5 text-success">
              <Check size={16} strokeWidth={2} /> {t("welcome.extensionInstalled")}
            </div>
          )}

          {/* One browser: the button names it, a list of one says nothing more. */}
          {browsers?.length !== 1 && (
            <fieldset>
              <legend className="sr-only">{t("install.browser")}</legend>
              {!browsers && (
                <div className="flex items-center gap-2 text-ink-muted">
                  <LoaderCircle className="animate-spin" size={15} /> {t("install.searching")}
                </div>
              )}
              {browsers?.length === 0 && <div className="text-ink-muted">{t("install.noBrowser")}</div>}
              <div className="grid gap-1.5">
                {browsers?.map((b) => (
                  <label
                    key={b.id}
                    className={`flex items-center gap-3 rounded-control border px-3 py-2 transition-colors ${
                      selected === b.id ? "border-accent-text/70 bg-accent/10" : "border-line hover:bg-ink/5"
                    }`}
                  >
                    <input
                      type="radio"
                      name="browser"
                      checked={selected === b.id}
                      onChange={() => {
                        setSelected(b.id);
                        setOpened(false);
                      }}
                      className="accent-accent"
                    />
                    <span className="flex-1 text-ink">{b.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <button
            type="button"
            onClick={start}
            disabled={!browser}
            className="flex h-9 items-center justify-center gap-2 rounded-control bg-accent font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            <ExternalLink size={15} strokeWidth={1.75} />
            {opened ? t("install.reopen", { browser: browser?.name }) : t("install.open", { browser: browser?.name ?? "" })}
          </button>
          {error && <div role="alert" className="text-danger">{error}</div>}

          {opened && (
            <ol className="grid gap-3 text-ink-muted">
              <Step n={1}>{t("install.step1", { dev: labels.dev, where: labels.where })}</Step>
              <Step n={2}>{t("install.step2", { load: labels.load })}</Step>
              <Step n={3}>{t("install.step3", { select: labels.select })}</Step>
              <li className="flex items-center gap-2 ps-8 text-xs">
                {installed ? (
                  <span className="flex items-center gap-1.5 text-success">
                    <Check size={14} /> {t("install.done")}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-ink-faint">
                    <LoaderCircle size={14} className="animate-spin" /> {t("install.waiting")}
                  </span>
                )}
              </li>
            </ol>
          )}

          <div className="flex items-center gap-2 border-t border-line pt-3 text-xs">
            <code dir="ltr" className="min-w-0 flex-1 truncate text-ink-faint" data-tip={extensionDir}>
              {extensionDir}
            </code>
            <IconButton aria-label={copied ? t("install.copied") : t("install.copy")} onClick={copyPath}>
              {copied ? <Check size={15} className="text-success" /> : <ClipboardCopy size={15} strokeWidth={1.75} className="text-ink-muted" />}
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent/20 text-[11px] font-semibold text-accent-text tabular-nums">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
