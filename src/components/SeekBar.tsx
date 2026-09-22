import { useRef, useState } from "react";
import { formatTime } from "../lib/types";

type Props = { position: number; duration: number; cached: number; onSeek: (seconds: number) => void };

export function SeekBar({ position, duration, cached, onSeek }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const ratioAt = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };
  const live = duration > 0 ? (drag ?? position / duration) : 0;
  const buffered = duration > 0 ? Math.min(1, cached / duration) : 0;

  return (
    <div
      ref={ref}
      className="group relative flex h-5 cursor-pointer items-center"
      onMouseMove={(e) => setHover(ratioAt(e.clientX))}
      onMouseLeave={() => setHover(null)}
      onPointerDown={(e) => {
        if (!duration) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(ratioAt(e.clientX));
      }}
      onPointerMove={(e) => drag !== null && setDrag(ratioAt(e.clientX))}
      onPointerUp={(e) => {
        if (drag === null) return;
        onSeek(ratioAt(e.clientX) * duration);
        setDrag(null);
      }}
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/20 transition-[height] group-hover:h-1.5">
        <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${buffered * 100}%` }} />
        <div className="absolute inset-y-0 left-0 bg-violet-500" style={{ width: `${live * 100}%` }} />
      </div>
      <div
        className="absolute size-3 -translate-x-1/2 rounded-full bg-white opacity-0 shadow group-hover:opacity-100"
        style={{ left: `${live * 100}%` }}
      />
      {hover !== null && duration > 0 && (
        <div
          className="pointer-events-none absolute bottom-6 -translate-x-1/2 rounded bg-black/80 px-2 py-0.5 text-xs text-white tabular-nums"
          style={{ left: `${hover * 100}%` }}
        >
          {formatTime(hover * duration)}
        </div>
      )}
    </div>
  );
}
