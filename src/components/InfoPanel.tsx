import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SquareSplitHorizontal, X } from "lucide-react";
import type { PlayerState } from "../hooks/usePlayer";
import { setWantInfo, type Upscale } from "../lib/player";
import { qualityLabel, scaleLabel, type Environment, type LoadTarget } from "../lib/types";
import { modelName, summarize } from "../lib/upscaleInfo";
import { IconButton } from "./ui";

type Props = {
  state: PlayerState;
  upscale: Upscale;
  preparing: boolean;
  target: LoadTarget | null;
  /** Source height cap requested from yt-dlp. */
  maxHeight: number;
  fullscreen: boolean;
  env: Environment | null;
  /** Before/after split on the picture. */
  compare: boolean;
  canCompare: boolean;
  onCompare: () => void;
  onClose: () => void;
};

const res = (w: number, h: number) => `${w}×${h}`;

function hostOf(url?: string) {
  if (!url) return "—";
  try {
    return new URL(url).host || url;
  } catch {
    return url.split(/[\\/]/).pop() ?? url;
  }
}

/** Source → input → ArtCNN → output, as mpv and the GPU report it. Toggled with ⓘ or I. */
export function InfoPanel({ state, upscale, preparing, target, maxHeight, fullscreen, env, compare, canCompare, onCompare, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const info = state.info;

  // netsucast.lua publishes the stream details only while the panel is open.
  useEffect(() => {
    setWantInfo(true).catch(() => {});
    return () => void setWantInfo(false).catch(() => {});
  }, []);

  const num = (value: number, digits = 0) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
  const rate = (bits?: number) =>
    !bits ? "—" : bits >= 1e6 ? t("info.mbps", { value: num(bits / 1e6, 1) }) : t("info.kbps", { value: num(bits / 1e3) });

  const s = summarize(state, upscale, preparing);
  const frameBudget = state.fps > 0 ? 1000 / state.fps : 0;
  const gpu = state.upscale;
  const vp = info.videoParams ?? {};
  const hdr = vp.gamma === "pq" || vp.gamma === "hlg";
  const ap = info.audioParams ?? {};
  const audioTrack = state.tracks.find((tr) => tr.type === "audio" && tr.selected);

  const status = {
    off: <span className="text-ink-muted">{t("info.statusOff")}</span>,
    preparing: <span className="text-warning">{t("info.statusPreparing")}</span>,
    measuring: <span className="text-ink-muted">{t("info.statusMeasuring")}</span>,
    inactive: <span className="text-ink-muted">{t("info.statusInactive")}</span>,
    active: <span className="text-success">✓ {t("info.statusActive", { factor: s.factor })}</span>,
  }[s.status];

  const kind = target ? { page: t("info.kindPage"), stream: t("info.kindStream"), file: t("info.kindFile") }[target.kind] : null;
  // mpv's video-codec is a long description ("Alliance for Open Media AV1"): the track's short
  // name reads better when the stream details have not arrived yet.
  const codec = info.videoFormat ?? state.tracks.find((tr) => tr.type === "video" && tr.selected)?.codec ?? null;
  const has = (v: unknown) => v !== undefined && v !== null && v !== "" && v !== 0;

  // Rows with nothing to show are left out, and a block with no row at all goes with them:
  // a column of dashes says nothing.
  const blocks: { title: string; rows: [string, ReactNode | null, string?][] }[] = [
    {
      title: t("info.source"),
      rows: [
        [t("info.type"), kind],
        [t("info.origin"), target?.url || info.path ? <bdi dir="ltr">{hostOf(target?.url ?? info.path)}</bdi> : null, target?.url ?? info.path],
        [t("info.container"), info.fileFormat ?? null],
        [t("info.hlsVariant"), has(info.hlsBitrate) ? rate(info.hlsBitrate) : null],
        [t("info.requestedQuality"), target?.kind === "page" ? t("info.requestedQualityValue", { quality: qualityLabel(t, maxHeight) }) : null],
        [t("info.buffer"), has(info.cacheDuration) ? t("info.seconds", { value: num(info.cacheDuration!) }) : null],
        [t("info.network"), has(info.cacheSpeed) ? rate(info.cacheSpeed! * 8) : null],
      ],
    },
    {
      title: t("info.video"),
      rows: [
        [t("info.resolution"), state.videoWidth ? res(state.videoWidth, state.videoHeight) : null],
        [t("info.codec"), codec],
        [t("info.fps"), state.fps ? num(state.fps, state.fps % 1 ? 2 : 0) : null],
        [t("info.bitrate"), has(info.videoBitrate) ? rate(info.videoBitrate) : null],
        [t("info.pixelFormat"), vp.pixelformat ?? null],
        [t("info.colors"), vp.primaries ? `${vp.primaries} · ${vp.gamma ?? "?"} · ${hdr ? "HDR" : "SDR"}` : null],
        [t("info.decoding"), state.videoWidth ? (state.hwdec ? t("info.decodingGpu", { name: state.hwdec }) : t("info.decodingCpu")) : null],
      ],
    },
    {
      title: t("info.audio"),
      rows: [
        [t("info.codec"), info.audioCodec ?? null],
        [t("info.channels"), ap["channel-count"] ? `${ap["channel-count"]} (${ap.channels ?? ""})` : null],
        [t("info.sampleRate"), ap.samplerate ? t("info.khz", { value: num(ap.samplerate / 1000, 1) }) : null],
        [t("info.bitrate"), has(info.audioBitrate) ? rate(info.audioBitrate) : null],
        [t("info.language"), audioTrack?.lang ? audioTrack.lang.toUpperCase() : null],
      ],
    },
    {
      title: `${t("info.upscaleTitle")} ${upscale.model === "off" ? "" : modelName(upscale.model)}`,
      rows: [
        [t("info.state"), status],
        [t("info.upscaled"), s.status === "active" ? res(s.upscaledWidth, s.upscaledHeight) : null],
        [t("info.scale"), `${scaleLabel(t, upscale.scale, true)}${upscale.force ? ` · ${t("info.always")}` : ""}`],
        [t("info.gpuCost"), gpu && s.status === "active" ? t("info.perFrame", { ms: num(gpu.artcnnMs, 1) }) : null],
      ],
    },
    {
      title: t("info.output"),
      rows: [
        [t("info.display"), state.displayWidth ? `${res(state.displayWidth, state.displayHeight)} (${fullscreen ? t("info.fullscreen") : t("info.window")})` : null],
        [t("info.screen"), has(info.displayFps) ? t("info.hz", { value: num(info.displayFps!) }) : null],
        [t("info.gpu"), env?.gpu?.name ?? null, env?.gpu?.name],
        [t("info.renderer"), info.gpuContext ? (info.gpuContext.includes("vk") ? "Vulkan" : info.gpuContext) : null],
        [
          t("info.gpuTime"),
          gpu ? (
            <span className={frameBudget && gpu.frameMs > frameBudget * 0.8 ? "text-warning" : ""}>
              {frameBudget
                ? t("info.gpuTimeOf", { ms: num(gpu.frameMs, 1), budget: num(frameBudget) })
                : t("info.perFrame", { ms: num(gpu.frameMs, 1) })}
            </span>
          ) : null,
        ],
        [t("info.dropped"), <span className={state.droppedFrames > 0 ? "text-warning" : ""}>{num(state.droppedFrames)}</span>],
      ],
    },
  ];

  return (
    <aside
      aria-label={t("info.title")}
      className="absolute top-14 end-4 z-30 flex max-h-[calc(100%-9.5rem)] w-80 animate-fade-in flex-col rounded-panel border border-line bg-page/92 text-xs shadow-overlay"
    >
      <div className="flex items-center gap-0.5 ps-4 pe-1.5 pt-1.5">
        <span className="flex-1 text-sm font-medium text-ink">{t("info.title")}</span>
        <IconButton
          aria-label={t("compare.toggle")}
          shortcut="B"
          active={compare}
          disabled={!canCompare}
          disabledReason={t("compare.needsUpscale")}
          onClick={onCompare}
        >
          <SquareSplitHorizontal size={17} strokeWidth={1.75} />
        </IconButton>
        <IconButton aria-label={t("player.dismiss")} onClick={onClose}>
          <X size={15} strokeWidth={1.75} className="text-ink-muted" />
        </IconButton>
      </div>

      <div className="grid gap-4 overflow-x-hidden overflow-y-auto px-4 pt-1 pb-4">
        {blocks.map((block) => {
          const rows = block.rows.filter(([, value]) => value !== null);
          if (!rows.length) return null;
          return (
            <section key={block.title}>
              <h3 className="mb-1.5 text-xs font-medium text-ink-muted">{block.title}</h3>
              <div className="grid gap-1 border-s border-line ps-3">
                {rows.map(([label, value, full]) => (
                  <div key={label} className="flex min-w-0 justify-between gap-3">
                    <span className="shrink-0 text-ink-muted">{label}</span>
                    {/* A value too long for the panel is cut, and readable whole in its tooltip. */}
                    <span className="min-w-0 truncate text-end text-ink tabular-nums" data-tip={full}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
