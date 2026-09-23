import {
  AudioLines,
  Captions,
  Gauge,
  Info,
  Maximize,
  Minimize,
  MonitorPlay,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings as SettingsIcon,
  Sparkles,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PlayerState } from "../hooks/usePlayer";
import * as player from "../lib/player";
import type { Upscale } from "../lib/player";
import {
  MODELS,
  QUALITIES,
  formatTime,
  modelLabel,
  qualityLabel,
  scaleLabel,
  trackLabel,
  type Model,
  type UpscaleScale,
} from "../lib/types";
import { modelName, summarize } from "../lib/upscaleInfo";
import { Menu } from "./Menu";
import { SeekBar } from "./SeekBar";
import { IconButton } from "./ui";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const ICON = { size: 19, strokeWidth: 1.75 };

type Props = {
  state: PlayerState;
  upscale: Upscale;
  /** A model is being compiled: the picture is frozen until it is ready. */
  preparing: boolean;
  maxHeight: number;
  seekStep: number;
  canChangeQuality: boolean;
  fullscreen: boolean;
  infoOpen: boolean;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  onModel: (m: Model) => void;
  /** Auto model on, and the model it resolves to on this card. */
  auto: boolean;
  autoTarget: Model;
  onAuto: () => void;
  onScale: (s: UpscaleScale) => void;
  onQuality: (h: number) => void;
  onInfo: () => void;
  onFullscreen: () => void;
  onSettings: () => void;
};

export function Controls(p: Props) {
  const { t } = useTranslation();
  const { state } = p;
  const subs = state.tracks.filter((tr) => tr.type === "sub");
  const audios = state.tracks.filter((tr) => tr.type === "audio");
  const activeSub = subs.find((tr) => tr.selected);
  const up = summarize(state, p.upscale, p.preparing);
  const muted = state.mute || state.volume === 0;
  const VolumeIcon = muted ? VolumeX : state.volume < 50 ? Volume1 : Volume2;
  const volume = muted ? 0 : state.volume;

  return (
    <div className="bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pt-14 pb-2.5">
      <SeekBar position={state.timePos} duration={state.duration} cached={state.cacheTime} onSeek={player.seekAbsolute} />

      <div className="mt-1 flex items-center gap-0.5">
        <IconButton aria-label={state.pause ? t("player.play") : t("player.pause")} shortcut={t("keys.space")} onClick={player.togglePause}>
          {state.pause ? <Play size={20} fill="currentColor" strokeWidth={0} /> : <Pause size={20} fill="currentColor" strokeWidth={0} />}
        </IconButton>
        <IconButton aria-label={t("player.back", { seconds: p.seekStep })} shortcut="J" onClick={() => player.seekRelative(-p.seekStep)}>
          <RotateCcw {...ICON} />
        </IconButton>
        <IconButton aria-label={t("player.forward", { seconds: p.seekStep })} shortcut="L" onClick={() => player.seekRelative(p.seekStep)}>
          <RotateCw {...ICON} />
        </IconButton>

        <div className="group/vol flex items-center">
          <IconButton aria-label={muted ? t("player.unmute") : t("player.mute")} shortcut="M" onClick={player.toggleMute}>
            <VolumeIcon {...ICON} />
          </IconButton>
          <input
            type="range"
            min={0}
            max={130}
            value={volume}
            aria-label={t("player.volume")}
            onChange={(e) => player.setVolume(Number(e.target.value))}
            style={{ "--fill": `${(volume / 130) * 100}%` } as React.CSSProperties}
            className="w-0 opacity-0 transition-[width,opacity] duration-150 group-focus-within/vol:w-24 group-focus-within/vol:opacity-100 group-hover/vol:w-24 group-hover/vol:opacity-100 [@media(hover:none)]:w-24 [@media(hover:none)]:opacity-100"
          />
        </div>

        <span dir="ltr" className="ms-2 text-sm text-ink tabular-nums">
          {formatTime(state.timePos)} <span className="text-ink-muted">/ {formatTime(state.duration)}</span>
        </span>

        <div className="flex-1" />

        {p.upscale.model !== "off" && (
          <button
            type="button"
            onClick={p.onInfo}
            data-tip={t("player.badgeTip")}
            data-tip-key="I"
            className={`me-1 rounded-control px-2 py-1 text-xs font-medium tabular-nums transition-colors ${
              up.status === "active"
                ? "bg-accent/20 text-accent-text hover:bg-accent/30"
                : up.status === "preparing"
                  ? "bg-warning/15 text-warning"
                  : "bg-ink/8 text-ink-muted hover:bg-ink/12"
            }`}
          >
            {modelName(p.upscale.model)}
            {up.status === "preparing" && ` · ${t("player.badgePreparing")}`}
            {up.status === "inactive" && ` · ${t("player.badgeInactive")}`}
            {up.status === "active" && (
              <span dir="ltr">{` · ${state.videoHeight}p → ${up.upscaledHeight}p ×${up.factor}`}</span>
            )}
          </button>
        )}

        <Menu
          id="subs"
          open={p.openMenu}
          setOpen={p.setOpenMenu}
          title={t("player.subtitles")}
          shortcut="C"
          emptyText={t("player.nothing")}
          icon={<Captions {...ICON} />}
          badge={activeSub ? (activeSub.lang ?? "on").slice(0, 2).toUpperCase() : undefined}
          items={[
            { key: "no", label: t("player.subtitlesOff"), active: !activeSub, onSelect: () => player.setSub("no") },
            ...subs.map((tr) => ({
              key: String(tr.id),
              label: trackLabel(t, tr),
              hint: tr.external ? t("player.external") : undefined,
              active: tr.selected,
              onSelect: () => player.setSub(tr.id),
            })),
          ]}
        />
        {audios.length > 1 && (
          <Menu
            id="audio"
            open={p.openMenu}
            setOpen={p.setOpenMenu}
            title={t("player.audioTrack")}
            emptyText={t("player.nothing")}
            icon={<AudioLines {...ICON} />}
            items={audios.map((tr) => ({
              key: String(tr.id),
              label: trackLabel(t, tr),
              active: tr.selected,
              onSelect: () => player.setAudio(tr.id),
            }))}
          />
        )}
        <Menu
          id="model"
          open={p.openMenu}
          setOpen={p.setOpenMenu}
          title={t("player.upscale")}
          shortcut="U"
          emptyText={t("player.nothing")}
          icon={<Sparkles {...ICON} />}
          items={[
            {
              key: "auto",
              label: t("models.auto", { model: modelName(p.autoTarget) }),
              active: p.auto,
              onSelect: p.onAuto,
            },
            ...MODELS.map((m) => ({
              key: m,
              label: modelLabel(t, m),
              active: !p.auto && p.upscale.model === m,
              onSelect: () => p.onModel(m),
            })),
            ...(["auto", "x2"] as const).map((s) => ({
              key: `scale-${s}`,
              group: t("settings.scale"),
              label: scaleLabel(t, s),
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
            title={t("player.sourceQuality")}
            emptyText={t("player.nothing")}
            icon={<MonitorPlay {...ICON} />}
            items={QUALITIES.map((h) => ({
              key: String(h),
              label: qualityLabel(t, h),
              active: p.maxHeight === h,
              onSelect: () => p.onQuality(h),
            }))}
          />
        )}
        <Menu
          id="speed"
          open={p.openMenu}
          setOpen={p.setOpenMenu}
          title={t("player.speed")}
          emptyText={t("player.nothing")}
          icon={<Gauge {...ICON} />}
          badge={state.speed !== 1 ? `${state.speed}×` : undefined}
          items={SPEEDS.map((s) => ({
            key: String(s),
            label: s === 1 ? t("player.speedNormal") : `${s}×`,
            active: Math.abs(state.speed - s) < 0.01,
            onSelect: () => player.setSpeed(s),
          }))}
        />
        <IconButton aria-label={t("player.info")} shortcut="I" active={p.infoOpen} onClick={p.onInfo}>
          <Info {...ICON} />
        </IconButton>
        <IconButton aria-label={t("player.settings")} onClick={p.onSettings}>
          <SettingsIcon {...ICON} />
        </IconButton>
        <IconButton aria-label={p.fullscreen ? t("player.exitFullscreen") : t("player.fullscreen")} shortcut="F" onClick={p.onFullscreen}>
          {p.fullscreen ? <Minimize {...ICON} /> : <Maximize {...ICON} />}
        </IconButton>
      </div>
    </div>
  );
}
