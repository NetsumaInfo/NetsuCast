import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ClipboardCopy, ExternalLink, LoaderCircle, X } from "lucide-react";

type Browser = { id: string; name: string; extensionsUrl: string; supported: boolean };

/** Button names differ slightly between Chromium browsers. */
const LABELS: Record<string, { dev: string; where: string; load: string }> = {
  edge: { dev: "Mode développeur", where: "dans le menu de gauche, en bas", load: "Charger l'extension décompressée" },
  opera: { dev: "Mode développeur", where: "en haut à droite", load: "Charger l'extension décompressée" },
  "opera-gx": { dev: "Mode développeur", where: "en haut à droite", load: "Charger l'extension décompressée" },
};
const DEFAULT_LABELS = { dev: "Mode développeur", where: "en haut à droite", load: "Charger l'extension non empaquetée" };

type Props = {
  extensionDir: string;
  installed: boolean;
  onClose: () => void;
};

export function InstallDialog({ extensionDir, installed, onClose }: Props) {
  const [browsers, setBrowsers] = useState<Browser[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    invoke<Browser[]>("list_browsers").then((list) => {
      setBrowsers(list);
      setSelected(list.find((b) => b.supported)?.id ?? null);
    });
  }, []);

  const browser = browsers?.find((b) => b.id === selected);
  const labels = (selected && LABELS[selected]) || DEFAULT_LABELS;

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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold">Installer l'extension NetsuCast</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-5 px-6 py-5 text-sm">
          {installed && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-200">
              <Check size={18} /> Extension installée. Le bouton NetsuCast apparaît maintenant sur les vidéos.
            </div>
          )}

          <div>
            <div className="mb-2 text-xs font-semibold tracking-wider text-violet-300 uppercase">Navigateur</div>
            {!browsers && <LoaderCircle className="animate-spin text-neutral-500" size={18} />}
            {browsers?.length === 0 && <div className="text-neutral-400">Aucun navigateur compatible trouvé.</div>}
            <div className="grid gap-2">
              {browsers?.map((b) => (
                <label
                  key={b.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${b.supported ? "cursor-pointer hover:bg-white/5" : "opacity-50"} ${selected === b.id ? "border-violet-500/60 bg-violet-500/10" : "border-white/10"}`}
                >
                  <input
                    type="radio"
                    name="browser"
                    disabled={!b.supported}
                    checked={selected === b.id}
                    onChange={() => {
                      setSelected(b.id);
                      setOpened(false);
                    }}
                    className="accent-violet-500"
                  />
                  <span className="flex-1">{b.name}</span>
                  {!b.supported && <span className="text-xs text-neutral-500">pas encore pris en charge</span>}
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={start}
            disabled={!browser}
            className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 font-semibold hover:bg-violet-500 disabled:opacity-40"
          >
            <ExternalLink size={16} /> {opened ? `Rouvrir ${browser?.name}` : `Ouvrir ${browser?.name ?? "le navigateur"}`}
          </button>
          {error && <div className="text-red-300">{error}</div>}

          {opened && (
            <ol className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-neutral-300">
              <Step n={1}>
                Active <b className="text-white">« {labels.dev} »</b> ({labels.where}).
              </Step>
              <Step n={2}>
                Clique sur <b className="text-white">« {labels.load} »</b>.
              </Step>
              <Step n={3}>
                Dans la fenêtre qui s'ouvre, colle le chemin (<b className="text-white">Ctrl+V</b>) dans la barre
                d'adresse en haut, appuie sur <b className="text-white">Entrée</b>, puis clique sur{" "}
                <b className="text-white">« Sélectionner un dossier »</b>.
              </Step>
              <li className="flex items-center gap-2 pt-1 text-xs text-neutral-500">
                {installed ? (
                  <><Check size={14} className="text-emerald-400" /> Terminé !</>
                ) : (
                  <><LoaderCircle size={14} className="animate-spin" /> NetsuCast attend l'extension…</>
                )}
              </li>
            </ol>
          )}

          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <code className="flex-1 truncate rounded bg-black/40 px-2 py-1" title={extensionDir}>{extensionDir}</code>
            <button onClick={copyPath} className="flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10 hover:text-white">
              {copied ? <Check size={14} /> : <ClipboardCopy size={14} />} {copied ? "Copié" : "Copier"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-200">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
