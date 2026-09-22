import { useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { FileVideo, FolderOpen, Link2, Play, Settings as SettingsIcon, Sparkles, TriangleAlert, Cast } from "lucide-react";
import { MODEL_LABELS, type Environment, type Model } from "../lib/types";

export type Warmup = { model: Model; index: number; total: number };

type Props = {
  env: Environment | null;
  mpvError: string | null;
  warmup: Warmup | null;
  onOpen: (url: string) => void;
  onSettings?: () => void;
};

export function Welcome({ env, mpvError, warmup, onOpen, onSettings }: Props) {
  const [url, setUrl] = useState("");
  const submit = () => url.trim() && onOpen(url.trim());

  return (
    <div className="relative flex h-full items-center justify-center p-8">
      {onSettings && (
        <button onClick={onSettings} title="Paramètres"
          className="absolute top-4 right-4 rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white">
          <SettingsIcon size={18} />
        </button>
      )}

      <div className="w-full max-w-xl">
        <h1 className="text-4xl font-bold tracking-tight">
          Netsu<span className="text-violet-400">Cast</span>
        </h1>
        <p className="mt-2 text-neutral-400">Lecteur vidéo avec upscale IA en temps réel (ArtCNN).</p>

        {mpvError && (
          <div className="mt-6 flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            <TriangleAlert className="shrink-0" size={18} />
            <div>
              <div className="font-semibold">Le lecteur n'a pas démarré</div>
              <div className="mt-1 break-all text-red-300/80">{mpvError}</div>
              <div className="mt-2 text-red-200/70">
                Lance <code className="rounded bg-black/40 px-1">run.bat</code> → « Install / update player tools », ou
                choisis le chemin de mpv dans les paramètres.
              </div>
            </div>
          </div>
        )}

        {warmup && (
          <div className="mt-6 rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 text-sm">
            <div className="flex items-center gap-2 font-medium text-violet-200">
              <Sparkles size={16} className="animate-pulse" />
              Préparation des modèles d'upscale ({warmup.index}/{warmup.total}) : {MODEL_LABELS[warmup.model].split(" ·")[0]}
            </div>
            <div className="mt-1 text-violet-200/60">
              Une seule fois : ensuite changer de modèle est instantané. Tu peux déjà lancer une vidéo.
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-violet-500 transition-all" style={{ width: `${((warmup.index - 1) / warmup.total) * 100}%` }} />
            </div>
          </div>
        )}

        <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-2 font-medium">
            <Cast size={18} className="text-violet-400" /> Caster depuis Chrome
          </div>
          <p className="mt-2 text-sm text-neutral-400">
            Sur n'importe quelle vidéo, clique sur le bouton <b className="text-neutral-200">NetsuCast</b> qui apparaît
            au survol, ou sur l'icône de l'extension (Alt+Maj+C). La vidéo se met en pause dans Chrome et continue ici.
          </p>
          {env?.extensionDir && (
            <button
              onClick={() => revealItemInDir(env.extensionDir!)}
              className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/10"
            >
              <FolderOpen size={14} /> Installer l'extension (dossier à charger dans chrome://extensions)
            </button>
          )}
        </div>

        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 focus-within:border-violet-500/60">
            <Link2 size={18} className="text-neutral-500" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Ou colle une URL…"
              className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-500"
            />
          </div>
          <button
            type="submit"
            disabled={!url.trim() || !!mpvError}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold hover:bg-violet-500 disabled:opacity-40"
          >
            <Play size={16} fill="currentColor" /> Lire
          </button>
        </form>

        <p className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
          <FileVideo size={14} /> Tu peux aussi glisser un fichier vidéo dans la fenêtre.
        </p>
      </div>
    </div>
  );
}
