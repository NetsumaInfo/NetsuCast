import { useState } from "react";
import { Globe, FileVideo, Link2, Play, TriangleAlert } from "lucide-react";
import type { Environment } from "../lib/types";

type Props = {
  env: Environment | null;
  mpvError: string | null;
  onOpen: (url: string) => void;
};

export function Welcome({ env, mpvError, onOpen }: Props) {
  const [url, setUrl] = useState("");
  const submit = () => url.trim() && onOpen(url.trim());

  return (
    <div className="flex h-full items-center justify-center p-8">
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
                Lance <code className="rounded bg-black/40 px-1">run.bat</code> → « Installer les outils », ou choisis le
                chemin de mpv dans les paramètres.
              </div>
            </div>
          </div>
        )}

        <form
          className="mt-8 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 focus-within:border-violet-500/60">
            <Link2 size={18} className="text-neutral-500" />
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Colle une URL (YouTube, X, lien .m3u8, .mp4…)"
              className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-500"
            />
          </div>
          <button
            type="submit"
            disabled={!url.trim() || !!mpvError}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-semibold hover:bg-violet-500 disabled:opacity-40"
          >
            <Play size={16} fill="currentColor" /> Lire
          </button>
        </form>

        <div className="mt-8 grid gap-3 text-sm text-neutral-400">
          <div className="flex items-start gap-3">
            <Globe size={18} className="mt-0.5 shrink-0 text-neutral-500" />
            <span>
              Depuis Chrome : ouvre la vidéo, clique sur l'extension <b className="text-neutral-200">NetsuCast</b> puis
              « Envoyer ». Récepteur{" "}
              {env?.receiverError ? (
                <span className="text-red-300">en erreur ({env.receiverError})</span>
              ) : (
                <span className="text-emerald-300">actif sur le port {env?.receiverPort ?? "…"}</span>
              )}
              .
            </span>
          </div>
          <div className="flex items-start gap-3">
            <FileVideo size={18} className="mt-0.5 shrink-0 text-neutral-500" />
            <span>Ou glisse un fichier vidéo dans la fenêtre.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
