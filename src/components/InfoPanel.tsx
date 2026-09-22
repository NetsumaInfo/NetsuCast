import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import type { PlayerState } from "../hooks/usePlayer";
import { readStreamInfo, type StreamInfo, type Upscale } from "../lib/player";
import { qualityLabel, scaleLabel, type LoadTarget } from "../lib/types";
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
  onClose: () => void;
};

const res = (w: number, h: number) => (w && h ? `${w}×${h}` : "—");

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
  const { t, i18n } = useTranslation();
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

  const kind = target ? { page: t("info.kindPage"), stream: t("info.kindStream"), file: t("info.kindFile") }[target.kind] : "—";

  return (
    <aside
      aria-label={t("info.title")}
      className="absolute top-14 end-4 bottom-24 z-30 flex w-80 animate-fade-in flex-col rounded-panel border border-line bg-page/92 text-xs shadow-overlay"
    >
      <div className="flex items-center justify-between ps-4 pe-1.5 pt-1.5">
        <span className="text-sm font-medium text-ink">{t("info.title")}</span>
        <IconButton aria-label={t("player.dismiss")} onClick={onClose}>
          <X size={15} strokeWidth={1.75} className="text-ink-muted" />
        </IconButton>
      </div>

      <div className="grid gap-4 overflow-y-auto px-4 pt-1 pb-4">
        <Block title={t("info.source")}>
          <Row label={t("info.type")}>{kind}</Row>
          <Row label={t("info.origin")}>
            <bdi dir="ltr">{hostOf(target?.url ?? info.path)}</bdi>
          </Row>
          <Row label={t("info.container")}>{info.fileFormat ?? "—"}</Row>
          {info.hlsBitrate ? <Row label={t("info.hlsVariant")}>{rate(info.hlsBitrate)}</Row> : null}
          {target?.kind === "page" && (
            <Row label={t("info.requestedQuality")}>{t("info.requestedQualityValue", { quality: qualityLabel(t, maxHeight) })}</Row>
          )}
          <Row label={t("info.buffer")}>{info.cacheDuration != null ? t("info.seconds", { value: num(info.cacheDuration) }) : "—"}</Row>
          <Row label={t("info.network")}>{rate(info.cacheSpeed ? info.cacheSpeed * 8 : undefined)}</Row>
        </Block>

        <Block title={t("info.video")}>
          <Row label={t("info.resolution")}>{res(state.videoWidth, state.videoHeight)}</Row>
          <Row label={t("info.codec")}>{info.videoFormat ?? (state.codec.split(" ")[0] || "—")}</Row>
          <Row label={t("info.fps")}>{state.fps ? num(state.fps, state.fps % 1 ? 2 : 0) : "—"}</Row>
          <Row label={t("info.bitrate")}>{rate(info.videoBitrate)}</Row>
          <Row label={t("info.pixelFormat")}>{vp.pixelformat ?? "—"}</Row>
          <Row label={t("info.colors")}>{vp.primaries ? `${vp.primaries} · ${vp.gamma ?? "?"} · ${hdr ? "HDR" : "SDR"}` : "—"}</Row>
          <Row label={t("info.decoding")}>{state.hwdec ? t("info.decodingGpu", { name: state.hwdec }) : t("info.decodingCpu")}</Row>
        </Block>

        <Block title={t("info.audio")}>
          <Row label={t("info.codec")}>{info.audioCodec ?? "—"}</Row>
          <Row label={t("info.channels")}>{ap["channel-count"] ? `${ap["channel-count"]} (${ap.channels ?? ""})` : "—"}</Row>
          <Row label={t("info.sampleRate")}>{ap.samplerate ? t("info.khz", { value: num(ap.samplerate / 1000, 1) }) : "—"}</Row>
          <Row label={t("info.bitrate")}>{rate(info.audioBitrate)}</Row>
          {audioTrack?.lang && <Row label={t("info.language")}>{audioTrack.lang.toUpperCase()}</Row>}
        </Block>

        <Block title={`${t("info.upscaleTitle")} ${upscale.model === "off" ? "" : modelName(upscale.model)}`}>
          <Row label={t("info.state")}>{status}</Row>
          <Row label={t("info.upscaled")}>{s.status === "active" ? res(s.upscaledWidth, s.upscaledHeight) : "—"}</Row>
          <Row label={t("info.scale")}>
            {scaleLabel(t, upscale.scale, true)}
            {upscale.force ? ` · ${t("info.always")}` : ""}
          </Row>
          {gpu && s.status === "active" && <Row label={t("info.gpuCost")}>{t("info.perFrame", { ms: num(gpu.artcnnMs, 1) })}</Row>}
        </Block>

        <Block title={t("info.output")}>
          <Row label={t("info.display")}>
            {res(state.displayWidth, state.displayHeight)} ({fullscreen ? t("info.fullscreen") : t("info.window")})
          </Row>
          <Row label={t("info.screen")}>{info.displayFps ? t("info.hz", { value: num(info.displayFps) }) : "—"}</Row>
          <Row label={t("info.renderer")}>{info.gpuContext?.includes("vk") ? "Vulkan" : (info.gpuContext ?? "—")}</Row>
          {gpu && (
            <Row label={t("info.gpuTime")}>
              <span className={frameBudget && gpu.frameMs > frameBudget * 0.8 ? "text-warning" : ""}>
                {frameBudget
                  ? t("info.gpuTimeOf", { ms: num(gpu.frameMs, 1), budget: num(frameBudget) })
                  : t("info.perFrame", { ms: num(gpu.frameMs, 1) })}
              </span>
            </Row>
          )}
          <Row label={t("info.dropped")}>
            <span className={state.droppedFrames > 0 ? "text-warning" : ""}>{num(state.droppedFrames)}</span>
          </Row>
        </Block>
      </div>
    </aside>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-medium text-accent-text">{title}</h3>
      <div className="grid gap-1 border-s border-line ps-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-ink-muted">{label}</span>
      <span className="truncate text-end text-ink tabular-nums">{children}</span>
    </div>
  );
}
