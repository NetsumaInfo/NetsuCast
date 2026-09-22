import {
  Info,
  AudioLines,
  Captions,
  Gauge,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings as SettingsIcon,
  Sparkles,
  Volume1,
  Volume2,
  VolumeX,
  MonitorPlay,
} from "lucide-react";
import type { PlayerState } from "../hooks/usePlayer";
import * as player from "../lib/player";
import type { Upscale } from "../lib/player";
import {
  MODEL_LABELS,
  MODELS,
  QUALITIES,
  SCALE_LABELS,
  formatTime,
  qualityLabel,
  trackLabel,
  type Model,
  type UpscaleScale,
} from "../lib/types";
import { modelName, summarize } from "../lib/upscaleInfo";
import { IconButton, Menu } from "./Menu";
import { SeekBar } from "./SeekBar";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

type Props = {
  state: PlayerState;
  upscale: Upscale;
  /** A model is being compiled: the picture is frozen until it is ready. */
  preparing: boolean;
  maxHeight: number;
  canChangeQuality: boolean;
  fullscreen: boolean;
  infoOpen: boolean;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  onModel: (m: Model) => void;
  onScale: (s: UpscaleScale) => void;
  onInfo: () => void;
  onQuality: (h: number) => void;
  onFullscreen: () => void;
  onSettings: () => void;
};

export function Controls(p: Props) {
  const { state } = p;
  const subs = state.tracks.filter((t) => t.type === "sub");
  const audios = state.tracks.filter((t) => t.type === "audio");
  const activeSub = subs.find((t) => t.selected);
  const up = summarize(state, p.upscale, p.preparing);
  const VolumeIcon = state.mute || state.volume === 0 ? VolumeX : state.volume < 50 ? Volume1 : Volume2;

  return (
    <div className="bg-gradient-to-t from-black/90 via-black/60 to-transparent px-5 pt-16 pb-3">
      <SeekBar position={state.timePos} duration={state.duration} cached={state.cacheTime} onSeek={player.seekAbsolute} />

      <div className="mt-1 flex items-center gap-1">
        <IconButton title={state.pause ? "Lecture (Espace)" : "Pause (Espace)"} onClick={player.togglePause}>
          {state.pause ? <Play size={22} fill="currentColor" /> : <Pause size={22} fill="currentColor" />}
        </IconButton>
        <IconButton title="Reculer 10 s (J)" onClick={() => player.seekRelative(-10)}>
          <RotateCcw size={19} />
        </IconButton>
        <IconButton title="Avancer 10 s (L)" onClick={() => player.seekRelative(10)}>
          <RotateCw size={19} />
        </IconButton>

        <div className="group/vol flex items-center">
          <IconButton title="Muet (M)" onClick={player.toggleMute}>
            <VolumeIcon size={20} />
          </IconButton>
          <input
            type="range"
            min={0}
            max={130}
            value={state.mute ? 0 : state.volume}
            onChange={(e) => player.setVolume(Number(e.target.value))}
            className="w-0 accent-violet-500 opacity-0 transition-all group-hover/vol:w-24 group-hover/vol:opacity-100"
            title={`Volume ${Math.round(state.volume)} %`}
          />
        </div>

        <span className="ml-2 text-sm text-neutral-200 tabular-nums">
          {formatTime(state.timePos)} <span className="text-neutral-500">/ {formatTime(state.duration)}</span>
        </span>

        <div className="flex-1" />

        {p.upscale.model !== "off" && (
          <button
            onClick={p.onInfo}
            title="Détails entrée → upscale → sortie (I)"
            className={`mr-1 rounded-md px-2 py-1 text-xs font-medium tabular-nums ${
              up.status === "active" ? "bg-violet-500/25 text-violet-200" : up.status === "preparing" ? "bg-amber-500/20 text-amber-200" : "bg-white/10 text-neutral-400"
            }`}
          >
            {modelName(p.upscale.model)}
            {up.status === "preparing" && " · préparation…"}
            {up.status === "inactive" && " · inactif"}
            {up.status === "active" && ` · ${state.videoHeight}p → ${up.upscaledHeight}p ×${up.factor}`}
          </button>
        )}

        <Menu
          id="subs"
          open={p.openMenu}
          setOpen={p.setOpenMenu}
          title="Sous-titres"
          icon={<Captions size={20} />}
          badge={activeSub ? (activeSub.lang ?? "ON").slice(0, 2).toUpperCase() : undefined}
          items={[
            { key: "no", label: "Désactivés", active: !activeSub, onSelect: () => player.setSub("no") },
            ...subs.map((t) => ({
              key: String(t.id),
              label: trackLabel(t),
              hint: t.external ? "externe" : undefined,
              active: t.selected,
              onSelect: () => player.setSub(t.id),
            })),
          ]}
        />
        {audios.length > 1 && (
          <Menu
            id="audio"
            open={p.openMenu}
            setOpen={p.setOpenMenu}
            title="Piste audio"
            icon={<AudioLines size={20} />}
            items={audios.map((t) => ({
              key: String(t.id),
              label: trackLabel(t),
              active: t.selected,
              onSelect: () => player.setAudio(t.id),
            }))}
          />
        )}
        <Menu
          id="model"
          open={p.openMenu}
          setOpen={p.setOpenMenu}
          title="Upscale ArtCNN"
          icon={<Sparkles size={20} />}
          items={[
            ...MODELS.map((m) => ({ key: m, label: MODEL_LABELS[m], active: p.upscale.model === m, onSelect: () => p.onModel(m) })),
            ...(["auto", "x2"] as const).map((s) => ({
              key: `scale-${s}`,
              label: `Échelle : ${SCALE_LABELS[s]}`,
              active: p.upscale.scale === s,
              onSelect: () => p.onScale(s),
            })),
          ]}
        />
        {p.canChangeQuality && (
          <Menu
            id="quality"
            open={p.openMenu}
            setOpen={p.setOpenMenu}
            title="Qualité source max"
            icon={<MonitorPlay size={20} />}
            items={QUALITIES.map((h) => ({
              key: String(h),
              label: qualityLabel(h),
              active: p.maxHeight === h,
              onSelect: () => p.onQuality(h),
            }))}
          />
        )}
        <Menu
          id="speed"
          open={p.openMenu}
          setOpen={p.setOpenMenu}
          title="Vitesse"
          icon={<Gauge size={20} />}
          badge={state.speed !== 1 ? `${state.speed}×` : undefined}
          items={SPEEDS.map((s) => ({
            key: String(s),
            label: s === 1 ? "Normale" : `${s}×`,
            active: Math.abs(state.speed - s) < 0.01,
            onSelect: () => player.setSpeed(s),
          }))}
        />
        <IconButton title="Entrée → upscale → sortie (I)" active={p.infoOpen} onClick={p.onInfo}>
          <Info size={19} />
        </IconButton>
        <IconButton title="Paramètres" onClick={p.onSettings}>
          <SettingsIcon size={19} />
        </IconButton>
        <IconButton title="Plein écran (F)" onClick={p.onFullscreen}>
          {p.fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </IconButton>
      </div>
    </div>
  );
}
