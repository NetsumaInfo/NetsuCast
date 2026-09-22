import type { ReactNode } from "react";
import { ArrowDown, X } from "lucide-react";
import type { PlayerState } from "../hooks/usePlayer";
import type { Upscale } from "../lib/player";
import { qualityLabel, SCALE_LABELS } from "../lib/types";
import { modelName, summarize } from "../lib/upscaleInfo";

type Props = {
  state: PlayerState;
  upscale: Upscale;
  preparing: boolean;
  /** Source height cap requested from yt-dlp, null when it does not apply. */
  maxHeight: number | null;
  fullscreen: boolean;
  onClose: () => void;
};

const res = (w: number, h: number) => (w && h ? `${w}×${h}` : "—");

/** Input → ArtCNN → output, as measured on the GPU. Toggled with the ⓘ button or I. */
export function InfoPanel({ state, upscale, preparing, maxHeight, fullscreen, onClose }: Props) {
  const s = summarize(state, upscale, preparing);
  const frameBudget = state.fps > 0 ? 1000 / state.fps : 0;
  const gpu = state.upscale;

  const statusText = {
    off: <span className="text-neutral-400">désactivé</span>,
    preparing: <span className="text-amber-300">préparation du modèle…</span>,
    measuring: <span className="text-neutral-400">mesure…</span>,
    inactive: (
      <span className="text-neutral-400">inactif : la vidéo n'est pas agrandie (active « Toujours upscaler »)</span>
    ),
    active: <span className="text-emerald-300">✓ actif ×{s.factor}</span>,
  }[s.status];

  return (
    <div className="absolute top-14 right-4 z-30 w-80 rounded-xl border border-white/10 bg-neutral-950/90 p-4 text-xs shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">Image</span>
        <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-white/10 hover:text-white">
          <X size={14} />
        </button>
      </div>

      <Block title="Entrée">
        <Row label="Résolution">{res(state.videoWidth, state.videoHeight)}</Row>
        <Row label="Format">
          {[state.codec.split(" ")[0], state.fps ? `${state.fps.toFixed(state.fps % 1 ? 2 : 0)} i/s` : ""]
            .filter(Boolean)
            .join(" · ") || "—"}
        </Row>
        <Row label="Décodage">{state.hwdec ? `carte graphique (${state.hwdec})` : "processeur"}</Row>
        {maxHeight !== null && <Row label="Qualité demandée">{qualityLabel(maxHeight)} max</Row>}
      </Block>

      <Arrow />

      <Block title={`Upscale ArtCNN ${upscale.model === "off" ? "" : modelName(upscale.model)}`}>
        <Row label="État">{statusText}</Row>
        <Row label="Résolution upscalée">
          {s.status === "active" ? res(s.upscaledWidth, s.upscaledHeight) : "—"}
        </Row>
        <Row label="Échelle">{SCALE_LABELS[upscale.scale].split(" (")[0]}{upscale.force ? " · toujours" : ""}</Row>
        {gpu && s.status === "active" && <Row label="Coût GPU">{gpu.artcnnMs.toFixed(1)} ms / image</Row>}
      </Block>

      <Arrow />

      <Block title="Sortie">
        <Row label="Affichage">
          {res(state.displayWidth, state.displayHeight)} {fullscreen ? "(plein écran)" : "(fenêtre)"}
        </Row>
        {gpu && (
          <Row label="Temps GPU total">
            <span className={frameBudget && gpu.frameMs > frameBudget * 0.8 ? "text-amber-300" : ""}>
              {gpu.frameMs.toFixed(1)} ms{frameBudget ? ` / ${frameBudget.toFixed(0)} ms dispo` : ""}
            </span>
          </Row>
        )}
        <Row label="Images perdues">
          <span className={state.droppedFrames > 0 ? "text-amber-300" : ""}>{state.droppedFrames}</span>
        </Row>
      </Block>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-white/[0.04] p-3">
      <div className="mb-2 text-[10px] font-semibold tracking-wider text-violet-300 uppercase">{title}</div>
      <div className="grid gap-1">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right text-neutral-200 tabular-nums">{children}</span>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center py-1 text-neutral-600">
      <ArrowDown size={14} />
    </div>
  );
}
