import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Captions, Check, Download, Film, Info, Languages, LoaderCircle, RefreshCw, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LANGUAGES } from "../i18n";
import { BUY_ME_A_COFFEE, DISCORD_INVITE, GITHUB_REPO, GITHUB_SPONSORS } from "../lib/community";
import { releaseText, releases } from "../lib/releases";
import { THEMES, applyTheme, type ThemeId } from "../lib/theme";
import { MODELS, QUALITIES, autoModel, modelLabel, qualityLabel, scaleLabel, type Environment, type Settings } from "../lib/types";
import { checkForUpdate, downloadUpdate, installUpdate, setAutoCheck, setAutoInstall, useUpdater } from "../lib/updater";
import { modelName } from "../lib/upscaleInfo";
import { BuyMeACoffeeIcon, DiscordIcon, GithubIcon } from "./BrandIcons";
import { ReleaseNotes } from "./ReleaseNotes";
import { IconButton, SelectInput, Switch, TextInput } from "./ui";

type Props = {
  settings: Settings;
  /** The section to open on, "playback" by default. */
  initialSection?: Section;
  env: Environment | null;
  onClose: () => void;
  onSave: (next: Settings) => Promise<void>;
};

/** Fields that mpv only reads at startup, or that the receiver binds once. */
const RESTART_FIELDS: (keyof Settings)[] = ["receiverPort", "mpvPath", "ytdlpPath"];
const SECTIONS = ["playback", "upscale", "subtitles", "interface", "advanced", "updates", "about"] as const;
export type Section = (typeof SECTIONS)[number];
const SECTION_ICON: Record<Section, ReactNode> = {
  playback: <Film size={16} strokeWidth={1.75} />,
  upscale: <Sparkles size={16} strokeWidth={1.75} />,
  subtitles: <Captions size={16} strokeWidth={1.75} />,
  interface: <Languages size={16} strokeWidth={1.75} />,
  advanced: <SlidersHorizontal size={16} strokeWidth={1.75} />,
  updates: <Download size={16} strokeWidth={1.75} />,
  about: <Info size={16} strokeWidth={1.75} />,
};
const SECTION_KEY: Record<Section, string> = {
  playback: "settings.sectionPlayback",
  upscale: "settings.sectionUpscale",
  subtitles: "settings.sectionSubtitles",
  interface: "settings.sectionInterface",
  advanced: "settings.sectionAdvanced",
  updates: "settings.sectionUpdates",
  about: "settings.sectionAbout",
};

export function SettingsDialog({ settings, initialSection = "playback", env, onClose, onSave }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(settings);
  const [section, setSection] = useState<Section>(initialSection);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const needsRestart = RESTART_FIELDS.some((k) => draft[k] !== settings[k]);
  const dirty = (Object.keys(draft) as (keyof Settings)[]).some((k) => draft[k] !== settings[k]);
  // The theme previews live; closing without saving puts the saved one back.
  const cancel = useCallback(() => {
    applyTheme(settings.theme);
    onClose();
  }, [settings.theme, onClose]);

  // Modal: focus goes inside, Escape closes, Tab stays inside.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
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
  }, [cancel]);

  const updateYtdlp = async () => {
    setNote(t("settings.updating"));
    try {
      setNote(await invoke<string>("update_ytdlp"));
    } catch (e) {
      setNote(t("settings.error", { message: String(e) }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-black/60 p-6" onMouseDown={cancel}>
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
                section === s ? "bg-ink/8 text-ink" : "text-ink-muted hover:bg-ink/5 hover:text-ink"
              }`}
            >
              <span className={section === s ? "text-accent-text" : ""}>{SECTION_ICON[s]}</span>
              {t(SECTION_KEY[s])}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* The section name is already marked in the list on the left: no second title here. */}
          <div className="flex justify-end px-2 pt-2">
            <IconButton aria-label={t("settings.close")} shortcut={t("keys.escape")} onClick={cancel}>
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
                <Toggle label={t("settings.resume")} checked={draft.resumePosition} onChange={(v) => set("resumePosition", v)} />
                <Toggle label={t("settings.fullscreenOnCast")} checked={draft.fullscreenOnCast} onChange={(v) => set("fullscreenOnCast", v)} />
                <Toggle label={t("settings.alwaysOnTop")} checked={draft.alwaysOnTop} onChange={(v) => set("alwaysOnTop", v)} />
                <Toggle
                  label={t("settings.launchAtLogin")}
                  hint={t("settings.launchAtLoginHint")}
                  checked={draft.launchAtLogin}
                  onChange={(v) => set("launchAtLogin", v)}
                />
                <Toggle label={t("settings.hwdec")} checked={draft.hwdec !== "no"} onChange={(v) => set("hwdec", v ? "auto-safe" : "no")} />
              </>
            )}

            {section === "upscale" && (
              <>
                <Row label={t("settings.model")}>
                  {(id) => (
                    <SelectInput
                      id={id}
                      value={draft.model}
                      onChange={(v) => set("model", v as Settings["model"])}
                      options={[["auto", t("models.auto", { model: modelName(autoModel(env)) })], ...MODELS.map((m) => [m, modelLabel(t, m)] as [string, string])]}
                    />
                  )}
                </Row>
                <Toggle label={t("settings.force")} checked={draft.forceUpscale} onChange={(v) => set("forceUpscale", v)} />
                <Row label={t("settings.scale")}>
                  {(id) => (
                    <SelectInput
                      id={id}
                      value={draft.upscaleScale}
                      onChange={(v) => set("upscaleScale", v as Settings["upscaleScale"])}
                      options={(["auto", "x2"] as const).map((s) => [s, scaleLabel(t, s, true)])}
                    />
                  )}
                </Row>
                <Row label={t("settings.maxHeight")}>
                  {(id) => (
                    <SelectInput id={id} value={String(draft.maxHeight)} onChange={(v) => set("maxHeight", Number(v))} options={QUALITIES.map((h) => [String(h), qualityLabel(t, h)])} />
                  )}
                </Row>
                <Toggle label={t("settings.deband")} checked={draft.deband} onChange={(v) => set("deband", v)} />
              </>
            )}

            {section === "subtitles" && (
              <>
                <Row label={t("settings.subLangs")} hint={t("settings.subLangsHint")}>
                  {(id) => <TextInput id={id} dir="ltr" value={draft.subLangs} onChange={(e) => set("subLangs", e.target.value)} />}
                </Row>
                <Toggle label={t("settings.autoSubs")} checked={draft.autoSubs} onChange={(v) => set("autoSubs", v)} />
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
              <>
                <div className="py-4">
                  <div id="nc-theme-label" className="text-sm text-ink">
                    {t("settings.theme")}
                  </div>
                  <div role="radiogroup" aria-labelledby="nc-theme-label" className="mt-3 grid grid-cols-3 gap-2">
                    {THEMES.map((theme) => (
                      <ThemeCard
                        key={theme.id}
                        id={theme.id}
                        label={t(theme.label)}
                        selected={draft.theme === theme.id}
                        onSelect={() => {
                          set("theme", theme.id);
                          applyTheme(theme.id);
                        }}
                      />
                    ))}
                  </div>
                </div>
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
              </>
            )}

            {section === "advanced" && (
              <>
                <Row label={t("settings.port")} hint={env?.receiverError ? t("settings.portBusy", { port: env.receiverPort }) : undefined}>
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
                <Row label={t("settings.mpvPath")} wide>
                  {(id) => <TextInput id={id} dir="ltr" value={draft.mpvPath} placeholder={env?.mpvPath ?? t("settings.pathAuto")} onChange={(e) => set("mpvPath", e.target.value)} />}
                </Row>
                <Row label={t("settings.ytdlpPath")} wide>
                  {(id) => <TextInput id={id} dir="ltr" value={draft.ytdlpPath} placeholder={env?.ytdlpPath ?? t("settings.pathAuto")} onChange={(e) => set("ytdlpPath", e.target.value)} />}
                </Row>
              </>
            )}

            {section === "updates" && (
              <>
                <UpdatesSection />
                {/* yt-dlp follows its own pace: its site extractors break long before the app
                    ships a version, so it updates without waiting for one. */}
                <div className="flex flex-wrap items-center gap-3 border-t border-line py-4">
                  <SecondaryButton onClick={updateYtdlp}>
                    <RefreshCw size={14} strokeWidth={1.75} /> {t("settings.updateYtdlp")}
                  </SecondaryButton>
                  {note && (
                    <p role="status" className="min-w-0 flex-1 text-xs text-ink-muted">
                      {note}
                    </p>
                  )}
                </div>
                <ReleaseHistory />
              </>
            )}

            {section === "about" && <AboutSection />}
          </div>

          {/* Only once something changed: with nothing to save, the X (or Escape) is enough. */}
          {dirty && (
            <div className="flex animate-fade-in items-center gap-3 border-t border-line px-6 py-3">
              {needsRestart && <span className="text-xs text-warning">{t("settings.restartNote")}</span>}
              <div className="flex-1" />
              <button type="button" onClick={cancel} className="h-9 rounded-control px-4 text-sm text-ink-muted transition-colors hover:bg-ink/8 hover:text-ink">
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
          )}
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
      className="flex h-9 items-center gap-2 rounded-control border border-line-strong/70 px-3 text-sm text-ink transition-colors hover:bg-ink/8"
    >
      {children}
    </button>
  );
}

/** A theme, drawn in its own colours: the card carries its data-theme. */
function ThemeCard({ id, label, selected, onSelect }: { id: ThemeId; label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-w-0 flex-col gap-2 rounded-control border p-2 text-start transition-colors ${selected ? "border-accent-text bg-ink/5" : "border-line hover:bg-ink/5"}`}
    >
      <span data-theme={id} className="flex h-12 overflow-hidden rounded-[4px] border border-line bg-page">
        <span className="w-2.5 shrink-0 bg-accent" />
        <span className="flex flex-1 flex-col justify-center gap-1.5 bg-surface px-2">
          <span className="h-1.5 w-3/5 rounded-full bg-ink" />
          <span className="h-1.5 w-full rounded-full bg-raised" />
          <span className="h-1.5 w-4/5 rounded-full bg-line-strong" />
        </span>
      </span>
      <span className="flex items-center gap-1.5 text-xs text-ink">
        <span className="truncate">{label}</span>
        {selected && <Check size={13} strokeWidth={2} className="shrink-0 text-accent-text" />}
      </span>
    </button>
  );
}

function useAppVersion() {
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);
  return version;
}

/** Settings ▸ Updates: same store as the header button, so both show the same phase. */
function UpdatesSection() {
  const { t, i18n } = useTranslation();
  const { phase, version, progress, error, notes, autoCheck, autoInstall } = useUpdater();
  const current = useAppVersion();
  const busy = phase === "checking" || phase === "downloading" || phase === "installing";
  const percent =
    progress == null
      ? null
      : new Intl.NumberFormat(i18n.language, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(progress / 100);
  const status = {
    idle: t("update.idle", { version: current }),
    checking: t("update.checking"),
    available: t("update.available", { version }),
    downloading: t("update.downloading"),
    downloaded: t("update.downloaded"),
    staged: t("update.staged", { version }),
    installing: t("update.installing"),
    current: t("update.current"),
    error: t("update.failed"),
  }[phase];

  return (
    <>
      <Toggle label={t("update.auto")} checked={autoCheck} onChange={setAutoCheck} />
      <Toggle label={t("update.autoInstall")} checked={autoInstall} onChange={setAutoInstall} />
      <div className="border-t border-line py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className={`text-sm ${phase === "error" ? "text-danger" : "text-ink"}`}>
            {status}
          </p>
          <div className="flex gap-2">
            {!busy && phase !== "downloaded" && phase !== "staged" && (
              <SecondaryButton onClick={() => void checkForUpdate()}>
                <RefreshCw size={14} strokeWidth={1.75} /> {t("update.check")}
              </SecondaryButton>
            )}
            {phase === "checking" && (
              <SecondaryButton onClick={() => {}}>
                <LoaderCircle size={14} className="animate-spin" /> {t("update.check")}
              </SecondaryButton>
            )}
            {phase === "available" && (
              <PrimaryButton onClick={() => void downloadUpdate()}>
                <Download size={14} strokeWidth={1.75} /> {t("update.download")}
              </PrimaryButton>
            )}
            {/* Downloaded: the action left is a restart, and the button says so. */}
            {(phase === "downloaded" || phase === "staged") && (
              <PrimaryButton onClick={() => void installUpdate()}>
                <RefreshCw size={14} strokeWidth={1.75} /> {t("update.restart")}
              </PrimaryButton>
            )}
            {phase === "installing" && (
              <PrimaryButton onClick={() => {}}>
                <LoaderCircle size={14} className="animate-spin" /> {t("update.installing")}
              </PrimaryButton>
            )}
          </div>
        </div>
        {(phase === "downloading" || phase === "downloaded") && (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-accent-text transition-[width] duration-150" style={{ width: `${progress ?? 0}%` }} />
            </div>
            <span className="shrink-0 text-xs text-ink-muted tabular-nums">{percent}</span>
          </div>
        )}
        {error && <p className="mt-2 text-xs break-words text-danger">{error}</p>}
        {notes && <p className="mt-2 text-xs whitespace-pre-line text-ink-muted">{notes}</p>}
      </div>
    </>
  );
}

function ReleaseHistory() {
  const { t, i18n } = useTranslation();
  return (
    <div className="border-t border-line pt-4">
      <h4 className="text-xs font-medium text-ink-muted">{t("update.history")}</h4>
      <div className="mt-2 flex flex-col gap-2">
        {releases.map((release) => (
          <div key={release.id} className="rounded-panel border border-line p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium text-ink">{releaseText(release.title, i18n.language)}</span>
              <span className="rounded-full border border-line-strong/60 px-1.5 text-[10px] leading-4 text-ink-muted">v{release.version}</span>
              <span className="ms-auto text-xs text-ink-muted tabular-nums">{release.date}</span>
            </div>
            <ReleaseNotes release={release} compact />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Settings ▸ About: version, the Discord server, the two donation pages, the licence. */
function AboutSection() {
  const { t } = useTranslation();
  const version = useAppVersion();
  return (
    <div className="flex flex-col gap-6 py-2">
      <div>
        <div className="text-2xl font-semibold tracking-tight text-ink" translate="no">
          Netsu<span className="text-accent-text">Cast</span>
        </div>
        <p className="mt-0.5 text-xs text-ink-muted tabular-nums">v{version}</p>
        <p className="mt-2 text-sm text-ink-muted">{t("welcome.tagline")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium text-ink">{t("about.communityTitle")}</h4>
        {/* Brand colours: the only colours here that carry no meaning. */}
        <LinkRow url={DISCORD_INVITE} icon={<DiscordIcon size={20} className="text-[#5865F2]" />} name="Discord" action={t("about.discord")} />
      </div>
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium text-ink">{t("about.supportTitle")}</h4>
        <LinkRow url={GITHUB_SPONSORS} icon={<GithubIcon size={20} className="text-ink" />} name="GitHub Sponsors" action={t("about.sponsors")} />
        <LinkRow url={BUY_ME_A_COFFEE} icon={<BuyMeACoffeeIcon size={20} className="text-[#FFDD00]" />} name="Buy Me a Coffee" action={t("about.coffee")} />
      </div>
      <p className="text-xs leading-relaxed text-ink-muted">
        {t("about.legal")}{" "}
        <button type="button" onClick={() => void openUrl(GITHUB_REPO)} className="text-accent-text underline-offset-4 hover:underline">
          {t("about.source")}
        </button>
      </p>
    </div>
  );
}

function LinkRow({ url, icon, name, action }: { url: string; icon: ReactNode; name: string; action: string }) {
  return (
    <button
      type="button"
      onClick={() => void openUrl(url)}
      className="group flex items-center gap-3 rounded-panel border border-line px-3.5 py-3 text-start transition-colors hover:bg-ink/5"
    >
      {icon}
      <span className="text-sm font-medium text-ink" translate="no">
        {name}
      </span>
      <span className="ms-auto truncate text-xs text-ink-muted">{action}</span>
      <ArrowUpRight size={16} strokeWidth={1.75} className="shrink-0 text-ink-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none rtl:-scale-x-100" />
    </button>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-control bg-accent px-3 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
    >
      {children}
    </button>
  );
}
