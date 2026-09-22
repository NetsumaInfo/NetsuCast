import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { PlayerState } from "../hooks/usePlayer";
import { readStreamInfo, type StreamInfo, type Upscale } from "../lib/player";
import { qualityLabel, SCALE_LABELS, type LoadTarget } from "../lib/types";
import { modelName, summarize } from "../lib/upscaleInfo";

type Props = {
  state: PlayerState;
  upscale: Upscale;
  preparing: boolean;
  target: LoadTarget | null;
  /** Source height cap requested from yt-dlp. */
  maxHeight: number;
  fullscreen: boolean;
  onClose: () => void;
};

const res = (w: number, h: number) => (w && h ? `${w}×${h}` : "—");
const kbps = (bits?: number) =>
  bits ? (bits >= 1e6 ? `${(bits / 1e6).toFixed(1)} Mb/s` : `${Math.round(bits / 1e3)} kb/s`) : "—";
const speed = (bytes?: number) => (bytes ? kbps(bytes * 8) : "—");

const SOURCE_KIND: Record<LoadTarget["kind"], string> = {
  page: "page web, résolue par yt-dlp",
  stream: "flux direct",
  file: "fichier local",
};

function hostOf(url?: string) {
  if (!url) return "—";
  try {
    return new URL(url).host || url;
  } catch {
    return url.split(/[\\/]/).pop() ?? url;
  }
}

/** Source → input → ArtCNN → output, as mpv and the GPU report it. Toggled with ⓘ or I. */
export function InfoPanel({ state, upscale, preparing, target, maxHeight, fullscreen, onClose }: Props) {
  const [info, setInfo] = useState<StreamInfo>({});

  useEffect(() => {
    let alive = true;
    const refresh = () => readStreamInfo().then((i) => alive && setInfo(i)).catch(() => {});
    refresh();
    const id = window.setInterval(refresh, 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const s = summarize(state, upscale, preparing);
  const frameBudget = state.fps > 0 ? 1000 / state.fps : 0;
  const gpu = state.upscale;
  const vp = info.videoParams ?? {};
  const hdr = vp.gamma === "pq" || vp.gamma === "hlg";
  const ap = info.audioParams ?? {};
  const audioTrack = state.tracks.find((t) => t.type === "audio" && t.selected);

  const statusText = {
    off: <span className="text-neutral-400">désactivé</span>,
    preparing: <span className="text-amber-300">préparation du modèle…</span>,
    measuring: <span className="text-neutral-400">mesure…</span>,
    inactive: <span className="text-neutral-400">inactif (vidéo non agrandie)</span>,
    active: <span className="text-emerald-300">✓ actif ×{s.factor}</span>,
  }[s.status];

  return (
    <div className="absolute top-14 right-4 bottom-24 z-30 flex w-80 flex-col rounded-xl border border-white/10 bg-neutral-950/90 text-xs shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-sm font-semibold">Informations</span>
        <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-white/10 hover:text-white">
          <X size={14} />
        </button>
      </div>

      <div className="grid gap-2 overflow-y-auto px-4 pb-4">
        <Block title="Source">
          <Row label="Type">{target ? SOURCE_KIND[target.kind] : "—"}</Row>
          <Row label="Origine">{hostOf(target?.url ?? info.path)}</Row>
          <Row label="Conteneur">{info.fileFormat ?? "—"}</Row>
          {info.hlsBitrate ? <Row label="Variante HLS">{kbps(info.hlsBitrate)}</Row> : null}
          {target?.kind === "page" && <Row label="Qualité demandée">{qualityLabel(maxHeight)} max</Row>}
          <Row label="Mémoire tampon">{info.cacheDuration != null ? `${info.cacheDuration.toFixed(0)} s` : "—"}</Row>
          <Row label="Vitesse réseau">{speed(info.cacheSpeed)}</Row>
        </Block>

        <Block title="Vidéo (entrée)">
          <Row label="Résolution">{res(state.videoWidth, state.videoHeight)}</Row>
          <Row label="Codec">{info.videoFormat ?? (state.codec.split(" ")[0] || "—")}</Row>
          <Row label="Images/s">{state.fps ? state.fps.toFixed(state.fps % 1 ? 2 : 0) : "—"}</Row>
          <Row label="Débit">{kbps(info.videoBitrate)}</Row>
          <Row label="Format pixel">{vp.pixelformat ?? "—"}</Row>
          <Row label="Couleurs">
            {vp.primaries ? `${vp.primaries} · ${vp.gamma ?? "?"}${hdr ? " · HDR" : " · SDR"}` : "—"}
          </Row>
          <Row label="Décodage">{state.hwdec ? `carte graphique (${state.hwdec})` : "processeur"}</Row>
        </Block>

        <Block title="Audio">
          <Row label="Codec">{info.audioCodec ?? "—"}</Row>
          <Row label="Canaux">{ap["channel-count"] ? `${ap["channel-count"]} (${ap.channels ?? ""})` : "—"}</Row>
          <Row label="Fréquence">{ap.samplerate ? `${(ap.samplerate / 1000).toFixed(1)} kHz` : "—"}</Row>
          <Row label="Débit">{kbps(info.audioBitrate)}</Row>
          {audioTrack?.lang && <Row label="Langue">{audioTrack.lang.toUpperCase()}</Row>}
        </Block>

        <Block title={`Upscale ArtCNN ${upscale.model === "off" ? "" : modelName(upscale.model)}`}>
          <Row label="État">{statusText}</Row>
          <Row label="Résolution upscalée">{s.status === "active" ? res(s.upscaledWidth, s.upscaledHeight) : "—"}</Row>
          <Row label="Échelle">
            {SCALE_LABELS[upscale.scale].split(" (")[0]}
            {upscale.force ? " · toujours" : ""}
          </Row>
          {gpu && s.status === "active" && <Row label="Coût GPU">{gpu.artcnnMs.toFixed(1)} ms / image</Row>}
        </Block>

        <Block title="Sortie">
          <Row label="Affichage">
            {res(state.displayWidth, state.displayHeight)} {fullscreen ? "(plein écran)" : "(fenêtre)"}
          </Row>
          <Row label="Écran">{info.displayFps ? `${Math.round(info.displayFps)} Hz` : "—"}</Row>
          <Row label="Rendu">{info.gpuContext?.includes("vk") ? "Vulkan" : (info.gpuContext ?? "—")}</Row>
          {gpu && (
            <Row label="Temps GPU / image">
              <span className={frameBudget && gpu.frameMs > frameBudget * 0.8 ? "text-amber-300" : ""}>
                {gpu.frameMs.toFixed(1)} ms{frameBudget ? ` sur ${frameBudget.toFixed(0)} ms` : ""}
              </span>
            </Row>
          )}
          <Row label="Images perdues">
            <span className={state.droppedFrames > 0 ? "text-amber-300" : ""}>{state.droppedFrames}</span>
          </Row>
        </Block>
      </div>
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
      <span className="shrink-0 text-neutral-500">{label}</span>
      <span className="truncate text-right text-neutral-200 tabular-nums">{children}</span>
    </div>
  );
}
