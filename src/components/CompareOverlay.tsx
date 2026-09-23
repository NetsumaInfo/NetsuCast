import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical } from "lucide-react";
import type { PlayerState } from "../hooks/usePlayer";

type Props = {
  state: PlayerState;
  /** 0 to 1 across the picture: the source is drawn left of it, ArtCNN right of it. */
  split: number;
  onSplit: (split: number) => void;
  /** Model name for the right-hand label. */
  model: string;
};

// Over the picture itself: fixed dark chips, whatever the theme.
const chip = "absolute top-16 rounded-control bg-black/65 px-2 py-1 text-xs whitespace-nowrap text-white";

/**
 * The line mpv draws the comparison at (src-tauri/src/shaders/compare_tail.glsl), with a handle
 * to move it. mpv reports its picture in its own pixels; the webview lays out in CSS pixels.
 */
export function CompareOverlay({ state, split, onSplit, model }: Props) {
  const { t } = useTranslation();
  const dragging = useRef(false);
  const scale = state.osdWidth ? window.innerWidth / state.osdWidth : 1;
  const left = state.videoLeft * scale;
  const width = (state.osdWidth - state.videoLeft - state.videoRight) * scale || window.innerWidth;
  const x = left + split * width;

  const move = (clientX: number) => onSplit(Math.min(1, Math.max(0, (clientX - left) / width)));
  const onPointerDown = (e: PointerEvent) => {
    e.stopPropagation();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    move(e.clientX);
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const next = { ArrowLeft: split - step, ArrowRight: split + step, Home: 0, End: 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    onSplit(Math.min(1, Math.max(0, next)));
  };

  return (
    <div className="pointer-events-none absolute inset-0" dir="ltr">
      <span className={`${chip} -translate-x-[calc(100%+14px)]`} style={{ left: x }}>
        {t("compare.before")}
      </span>
      <span className={`${chip} translate-x-[14px]`} style={{ left: x }}>
        {t("compare.after", { model })}
      </span>

      <div
        role="slider"
        tabIndex={0}
        aria-label={t("compare.handle")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split * 100)}
        aria-valuetext={t("compare.handleValue", { percent: Math.round(split * 100) })}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => dragging.current && move(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
        className="group pointer-events-auto absolute inset-y-0 w-6 -translate-x-1/2 cursor-ew-resize touch-none outline-hidden"
        style={{ left: x }}
      >
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/85 shadow-[0_0_0_1px_rgb(0_0_0/35%)]" />
        <div className="absolute top-1/2 left-1/2 grid h-10 w-6 -translate-1/2 place-items-center rounded-full bg-white text-black shadow-overlay transition-transform group-hover:scale-110 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent-text">
          <GripVertical size={16} strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}
