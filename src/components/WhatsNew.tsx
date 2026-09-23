import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { releases } from "../lib/releases";
import { ReleaseNotes } from "./ReleaseNotes";

const SEEN_KEY = "netsucast.release.seen";

/**
 * What is new in the installed version, shown once after an update. A first install records the
 * version silently: nobody needs the notes of the version they just chose to install.
 */
export function WhatsNew() {
  const { t } = useTranslation();
  const latest = releases[0];
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(() => {
    try {
      const seen = localStorage.getItem(SEEN_KEY);
      if (seen === null) localStorage.setItem(SEEN_KEY, latest.id);
      return seen !== null && seen !== latest.id;
    } catch {
      return false;
    }
  });

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, latest.id);
    } catch {
      // shown again next launch
    }
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-black/60 p-6" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nc-whatsnew-title"
        className="flex max-h-full w-full max-w-xl flex-col rounded-panel border border-line bg-surface shadow-overlay"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="nc-whatsnew-title" className="px-6 pt-5 pb-4 text-base font-semibold text-ink">
          {t("update.whatsNew", { version: latest.version })}
        </h2>
        <div className="min-h-0 overflow-y-auto px-6 pb-2">
          <ReleaseNotes release={latest} />
        </div>
        <div className="flex justify-end border-t border-line px-6 py-3 mt-4">
          <button
            ref={button}
            type="button"
            onClick={close}
            className="h-9 rounded-control bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
          >
            {t("update.gotIt")}
          </button>
        </div>
      </div>
    </div>
  );
}
