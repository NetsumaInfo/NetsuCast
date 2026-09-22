import { useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, X } from "lucide-react";
import { MODEL_LABELS, MODELS, QUALITIES, SCALE_LABELS, qualityLabel, type Environment, type Settings } from "../lib/types";

type Props = {
  settings: Settings;
  env: Environment | null;
  onClose: () => void;
  onSave: (next: Settings) => Promise<void>;
};

/** Fields that mpv only reads at startup, or that the receiver binds once. */
const RESTART_FIELDS: (keyof Settings)[] = ["receiverPort", "mpvPath", "ytdlpPath"];

export function SettingsDialog({ settings, env, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(settings);
  const [ytdlp, setYtdlp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const needsRestart = RESTART_FIELDS.some((k) => draft[k] !== settings[k]);

  const updateYtdlp = async () => {
    setYtdlp("Mise à jour…");
    try {
      setYtdlp(await invoke<string>("update_ytdlp"));
    } catch (e) {
      setYtdlp(`Erreur : ${e}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold">Paramètres</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-6 overflow-y-auto px-6 py-5">
          <Section title="Upscale">
            <Field label="Modèle par défaut">
              <Select value={draft.model} onChange={(v) => set("model", v as Settings["model"])}
                options={MODELS.map((m) => [m, MODEL_LABELS[m]])} />
            </Field>
            <Toggle label="Toujours upscaler" hint="Même quand la vidéo a déjà la taille de la fenêtre : ArtCNN double la résolution puis l'image est ramenée à l'écran, plus nette et moins bruitée."
              checked={draft.forceUpscale} onChange={(v) => set("forceUpscale", v)} />
            <Field label="Échelle" hint="Auto : une seconde passe ArtCNN (×4) quand l'écran est bien plus grand que le ×2, par exemple une vidéo 540p en plein écran 4K.">
              <Select value={draft.upscaleScale} onChange={(v) => set("upscaleScale", v as Settings["upscaleScale"])}
                options={(["auto", "x2"] as const).map((s) => [s, SCALE_LABELS[s]])} />
            </Field>
            <Field label="Qualité source max" hint="Pour YouTube, X et les sites gérés par yt-dlp.">
              <Select value={String(draft.maxHeight)} onChange={(v) => set("maxHeight", Number(v))}
                options={QUALITIES.map((h) => [String(h), qualityLabel(h)])} />
            </Field>
            <Toggle label="Débanding" hint="Lisse les dégradés en escalier des flux compressés."
              checked={draft.deband} onChange={(v) => set("deband", v)} />
          </Section>

          <Section title="Sous-titres">
            <Field label="Langues préférées" hint="Codes séparés par des virgules. Vide = jamais activés d'office.">
              <Text value={draft.subLangs} onChange={(v) => set("subLangs", v)} placeholder="fr,en" />
            </Field>
            <Toggle label="Sous-titres générés automatiquement" hint="YouTube : ajoute les sous-titres auto."
              checked={draft.autoSubs} onChange={(v) => set("autoSubs", v)} />
          </Section>

          <Section title="Performances">
            <Field label="Décodage matériel">
              <Select value={draft.hwdec} onChange={(v) => set("hwdec", v as Settings["hwdec"])}
                options={[["auto-safe", "Activé"], ["no", "Désactivé (processeur)"]]} />
            </Field>
          </Section>

          <Section title="Avancé">
            <Field label="Port du récepteur" hint="Port local utilisé par l'extension Chrome (même valeur des deux côtés).">
              <Text value={String(draft.receiverPort)} onChange={(v) => set("receiverPort", Number(v.replace(/\D/g, "")) || 0)} />
            </Field>
            <Field label="Chemin de mpv" hint={`Vide = automatique${env?.mpvPath ? ` (${env.mpvPath})` : ""}`}>
              <Text value={draft.mpvPath} onChange={(v) => set("mpvPath", v)} placeholder="C:\…\mpv.exe" />
            </Field>
            <Field label="Chemin de yt-dlp" hint={`Vide = automatique${env?.ytdlpPath ? ` (${env.ytdlpPath})` : ""}`}>
              <Text value={draft.ytdlpPath} onChange={(v) => set("ytdlpPath", v)} placeholder="C:\…\yt-dlp.exe" />
            </Field>
            <div className="flex items-center gap-3">
              <button onClick={updateYtdlp}
                className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/10">
                <RefreshCw size={14} /> Mettre à jour yt-dlp
              </button>
              {ytdlp && <span className="text-xs text-neutral-400">{ytdlp}</span>}
            </div>
          </Section>
        </div>

        <div className="flex items-center gap-3 border-t border-white/10 px-6 py-4">
          {needsRestart && <span className="text-xs text-amber-300">Certains changements s'appliquent au prochain lancement.</span>}
          <div className="flex-1" />
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-white/10">Annuler</button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSave(draft);
              setBusy(false);
            }}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500 disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold tracking-wider text-violet-300 uppercase">{title}</h3>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm text-neutral-200">{label}</span>
      {children}
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

const inputClass =
  "h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-violet-500/60";

function Text({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className={inputClass} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select className={`${inputClass} [&>option]:bg-neutral-900`} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, label]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="grid gap-1">
        <span className="text-sm text-neutral-200">{label}</span>
        {hint && <span className="text-xs text-neutral-500">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-4 accent-violet-500" />
    </label>
  );
}
