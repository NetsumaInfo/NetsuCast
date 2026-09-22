import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Captions, Film, Languages, RefreshCw, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { LANGUAGES } from "../i18n";
import { resetWarmed } from "../lib/player";
import { MODELS, QUALITIES, modelLabel, qualityLabel, scaleLabel, type Environment, type Settings } from "../lib/types";
import { IconButton, SelectInput, Switch, TextInput } from "./ui";

type Props = {
  settings: Settings;
  env: Environment | null;
  onClose: () => void;
  onSave: (next: Settings) => Promise<void>;
};

/** Fields that mpv only reads at startup, or that the receiver binds once. */
const RESTART_FIELDS: (keyof Settings)[] = ["receiverPort", "mpvPath", "ytdlpPath"];
const SECTIONS = ["playback", "upscale", "subtitles", "interface", "advanced"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_ICON: Record<Section, ReactNode> = {
  playback: <Film size={16} strokeWidth={1.75} />,
  upscale: <Sparkles size={16} strokeWidth={1.75} />,
  subtitles: <Captions size={16} strokeWidth={1.75} />,
  interface: <Languages size={16} strokeWidth={1.75} />,
  advanced: <SlidersHorizontal size={16} strokeWidth={1.75} />,
};
const SECTION_KEY: Record<Section, string> = {
  playback: "settings.sectionPlayback",
  upscale: "settings.sectionUpscale",
  subtitles: "settings.sectionSubtitles",
  interface: "settings.sectionInterface",
  advanced: "settings.sectionAdvanced",
};

export function SettingsDialog({ settings, env, onClose, onSave }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(settings);
  const [section, setSection] = useState<Section>("playback");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const needsRestart = RESTART_FIELDS.some((k) => draft[k] !== settings[k]);

  // Modal: focus goes inside, Escape closes, Tab stays inside.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>("button, input, select")].filter((el) => !el.hasAttribute("disabled"));
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  const updateYtdlp = async () => {
    setNote(t("settings.updating"));
    try {
      setNote(await invoke<string>("update_ytdlp"));
    } catch (e) {
      setNote(t("settings.error", { message: String(e) }));
    }
  };

  const pathHint = (found: string | null | undefined) =>
    found ? t("settings.pathAutoFound", { path: found }) : t("settings.pathAuto");

  return (
    <div className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-black/60 p-6" onMouseDown={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nc-settings-title"
        className="flex h-[min(620px,100%)] w-full max-w-3xl overflow-hidden rounded-panel border border-line bg-surface shadow-overlay"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <nav className="flex w-52 shrink-0 flex-col gap-0.5 border-e border-line bg-page/60 p-2">
          <h2 id="nc-settings-title" className="px-2.5 pt-2 pb-3 text-sm font-semibold text-ink">
            {t("settings.title")}
          </h2>
          {SECTIONS.map((s, i) => (
            <button
              key={s}
              type="button"
              data-autofocus={i === 0 ? true : undefined}
              aria-current={section === s ? "page" : undefined}
              onClick={() => setSection(s)}
              className={`flex items-center gap-2.5 rounded-control px-2.5 py-2 text-start text-sm transition-colors ${
                section === s ? "bg-white/8 text-ink" : "text-ink-muted hover:bg-white/5 hover:text-ink"
              }`}
            >
              <span className={section === s ? "text-accent-text" : ""}>{SECTION_ICON[s]}</span>
              {t(SECTION_KEY[s])}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-6 pt-4 pb-2">
            <h3 className="text-base font-semibold text-ink">{t(SECTION_KEY[section])}</h3>
            <IconButton aria-label={t("settings.close")} shortcut={t("keys.escape")} onClick={onClose}>
              <X size={17} strokeWidth={1.75} className="text-ink-muted" />
            </IconButton>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {section === "playback" && (
              <>
                <Row label={t("settings.seekStep")}>
                  {(id) => (
                    <SelectInput
                      id={id}
                      value={String(draft.seekStep)}
                      onChange={(v) => set("seekStep", Number(v))}
                      options={[5, 10, 15, 30].map((s) => [String(s), t("settings.seekStepValue", { seconds: s })])}
                    />
                  )}
                </Row>
                <Toggle label={t("settings.resume")} hint={t("settings.resumeHint")} checked={draft.resumePosition} onChange={(v) => set("resumePosition", v)} />
                <Toggle label={t("settings.fullscreenOnCast")} hint={t("settings.fullscreenOnCastHint")} checked={draft.fullscreenOnCast} onChange={(v) => set("fullscreenOnCast", v)} />
                <Toggle label={t("settings.alwaysOnTop")} hint={t("settings.alwaysOnTopHint")} checked={draft.alwaysOnTop} onChange={(v) => set("alwaysOnTop", v)} />
                <Toggle label={t("settings.hwdec")} hint={t("settings.hwdecHint")} checked={draft.hwdec !== "no"} onChange={(v) => set("hwdec", v ? "auto-safe" : "no")} />
              </>
            )}

            {section === "upscale" && (
              <>
                <Row label={t("settings.model")}>
                  {(id) => (
                    <SelectInput id={id} value={draft.model} onChange={(v) => set("model", v as Settings["model"])} options={MODELS.map((m) => [m, modelLabel(t, m)])} />
                  )}
                </Row>
                <Toggle label={t("settings.force")} hint={t("settings.forceHint")} checked={draft.forceUpscale} onChange={(v) => set("forceUpscale", v)} />
                <Row label={t("settings.scale")} hint={t("settings.scaleHint")}>
                  {(id) => (
                    <SelectInput
                      id={id}
                      value={draft.upscaleScale}
                      onChange={(v) => set("upscaleScale", v as Settings["upscaleScale"])}
                      options={(["auto", "x2"] as const).map((s) => [s, scaleLabel(t, s, true)])}
                    />
                  )}
                </Row>
                <Row label={t("settings.maxHeight")} hint={t("settings.maxHeightHint")}>
                  {(id) => (
                    <SelectInput id={id} value={String(draft.maxHeight)} onChange={(v) => set("maxHeight", Number(v))} options={QUALITIES.map((h) => [String(h), qualityLabel(t, h)])} />
                  )}
                </Row>
                <Toggle label={t("settings.deband")} hint={t("settings.debandHint")} checked={draft.deband} onChange={(v) => set("deband", v)} />
              </>
            )}

            {section === "subtitles" && (
              <>
                <Row label={t("settings.subLangs")} hint={t("settings.subLangsHint")}>
                  {(id) => <TextInput id={id} dir="ltr" value={draft.subLangs} onChange={(e) => set("subLangs", e.target.value)} />}
                </Row>
                <Toggle label={t("settings.autoSubs")} hint={t("settings.autoSubsHint")} checked={draft.autoSubs} onChange={(v) => set("autoSubs", v)} />
                <Row label={t("settings.subScale")}>
                  {(id) => (
                    <SelectInput
                      id={id}
                      value={String(draft.subScale)}
                      onChange={(v) => set("subScale", Number(v))}
                      options={[0.8, 0.9, 1, 1.15, 1.3, 1.5].map((s) => [String(s), `${Math.round(s * 100)} %`])}
                    />
                  )}
                </Row>
                <Row label={t("settings.audioLangs")} hint={t("settings.audioLangsHint")}>
                  {(id) => <TextInput id={id} dir="ltr" value={draft.audioLangs} onChange={(e) => set("audioLangs", e.target.value)} />}
                </Row>
              </>
            )}

            {section === "interface" && (
              <Row label={t("settings.language")}>
                {(id) => (
                  <SelectInput
                    id={id}
                    value={draft.language}
                    onChange={(v) => set("language", v)}
                    options={[["auto", t("settings.languageAuto")], ...LANGUAGES.map((l) => [l.code, l.name] as [string, string])]}
                  />
                )}
              </Row>
            )}

            {section === "advanced" && (
              <>
                <Row label={t("settings.port")} hint={env?.receiverError ? t("settings.portBusy", { port: env.receiverPort }) : t("settings.portHint")}>
                  {(id) => (
                    <TextInput
                      id={id}
                      dir="ltr"
                      inputMode="numeric"
                      value={String(draft.receiverPort)}
                      onChange={(e) => set("receiverPort", Number(e.target.value.replace(/\D/g, "")) || 0)}
                    />
                  )}
                </Row>
                <Row label={t("settings.mpvPath")} hint={pathHint(env?.mpvPath)} wide>
                  {(id) => <TextInput id={id} dir="ltr" value={draft.mpvPath} onChange={(e) => set("mpvPath", e.target.value)} />}
                </Row>
                <Row label={t("settings.ytdlpPath")} hint={pathHint(env?.ytdlpPath)} wide>
                  {(id) => <TextInput id={id} dir="ltr" value={draft.ytdlpPath} onChange={(e) => set("ytdlpPath", e.target.value)} />}
                </Row>
                <div className="flex flex-wrap items-center gap-2 border-t border-line py-4">
                  <SecondaryButton onClick={updateYtdlp}>
                    <RefreshCw size={14} strokeWidth={1.75} /> {t("settings.updateYtdlp")}
                  </SecondaryButton>
                  <SecondaryButton
                    onClick={() => {
                      resetWarmed();
                      setNote(t("settings.resetModelsDone"));
                    }}
                  >
                    <Sparkles size={14} strokeWidth={1.75} /> {t("settings.resetModels")}
                  </SecondaryButton>
                </div>
                <p className="text-xs text-ink-faint">{t("settings.resetModelsHint")}</p>
                {note && (
                  <p role="status" className="mt-3 text-xs text-ink-muted">
                    {note}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-line px-6 py-3">
            {needsRestart && <span className="text-xs text-warning">{t("settings.restartNote")}</span>}
            <div className="flex-1" />
            <button type="button" onClick={onClose} className="h-9 rounded-control px-4 text-sm text-ink-muted transition-colors hover:bg-white/8 hover:text-ink">
              {t("settings.cancel")}
            </button>
            <button
              type="button"
              aria-disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                await onSave(draft);
                setBusy(false);
              }}
              className="h-9 rounded-control bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover aria-disabled:opacity-60"
            >
              {t("settings.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One setting: label and hint on the left, control on the right (or below when `wide`). */
function Row({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className={`border-t border-line py-4 first:border-t-0 ${wide ? "grid gap-2" : "flex items-start justify-between gap-6"}`}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm text-ink">
          {label}
        </label>
        {hint && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{hint}</p>}
      </div>
      <div className={wide ? "" : "w-56 shrink-0"}>{children(id)}</div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-6 border-t border-line py-4 first:border-t-0">
      <div className="min-w-0">
        <div id={id} className="text-sm text-ink">
          {label}
        </div>
        {hint && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} labelledBy={id} />
    </div>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-control border border-line-strong/70 px-3 text-sm text-ink transition-colors hover:bg-white/8"
    >
      {children}
    </button>
  );
}
