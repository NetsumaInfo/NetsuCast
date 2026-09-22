import { useEffect, useRef, useState, type ReactNode } from "react";

// Shared primitives. Tooltips are drawn by <TooltipLayer/>: any element with `data-tip` (and
// optionally `data-tip-key` for its shortcut) gets one on hover and on keyboard focus.

type IconButtonProps = {
  /** The action, as a verb: the accessible name and the tooltip. */
  "aria-label": string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
  className?: string;
};

export function IconButton({ "aria-label": label, shortcut, onClick, active, children, className = "" }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-tip={label}
      data-tip-key={shortcut}
      onClick={onClick}
      className={`relative grid size-9 shrink-0 place-items-center rounded-control text-ink transition-colors hover:bg-white/12 active:bg-white/18 ${active ? "bg-white/12 text-accent-text" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

/** One tooltip for the whole app: follows hover and focus, closes on Escape, flips at the edge. */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; key?: string; x: number; y: number; below: boolean } | null>(null);
  const timer = useRef<number>(undefined);
  const current = useRef<Element | null>(null);

  useEffect(() => {
    const show = (el: Element, delay: number) => {
      window.clearTimeout(timer.current);
      current.current = el;
      timer.current = window.setTimeout(() => {
        if (current.current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 48;
        setTip({
          text: el.getAttribute("data-tip") ?? "",
          key: el.getAttribute("data-tip-key") ?? undefined,
          x: r.left + r.width / 2,
          y: below ? r.bottom + 8 : r.top - 8,
          below,
        });
      }, delay);
    };
    const hide = () => {
      window.clearTimeout(timer.current);
      current.current = null;
      setTip(null);
    };
    const target = (e: Event) => (e.target as Element | null)?.closest?.("[data-tip]") ?? null;

    const onOver = (e: PointerEvent) => {
      const el = target(e);
      if (el && el !== current.current) show(el, tipVisible() ? 0 : 450);
      if (!el && current.current) hide();
    };
    const onFocus = (e: FocusEvent) => {
      const el = target(e);
      if (el && (e.target as Element).matches(":focus-visible")) show(el, 0);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    const tipVisible = () => document.getElementById("nc-tooltip") !== null;

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!tip) return null;
  // Keep the bubble inside the window: clamp its centre 120 px from each edge.
  const x = Math.min(Math.max(tip.x, 120), window.innerWidth - 120);
  return (
    <div
      id="nc-tooltip"
      role="tooltip"
      style={{ left: x, top: tip.y }}
      className={`pointer-events-none fixed z-[100] flex max-w-60 -translate-x-1/2 animate-fade-in items-center gap-2 rounded-control border border-line bg-overlay px-2.5 py-1.5 text-xs text-ink shadow-overlay ${tip.below ? "" : "-translate-y-full"}`}
    >
      <span>{tip.text}</span>
      {tip.key && <Kbd>{tip.key}</Kbd>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line-strong/60 px-1 font-sans text-[10px] leading-4 text-ink-muted">
      {children}
    </kbd>
  );
}

export function Switch({ checked, onChange, labelledBy }: { checked: boolean; onChange: (v: boolean) => void; labelledBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-line-strong/70"}`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4.5 rtl:-translate-x-4.5" : "translate-x-0.5 rtl:-translate-x-0.5"} start-0`}
      />
    </button>
  );
}

const fieldClass =
  "h-9 w-full rounded-control border border-line-strong/70 bg-surface px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint hover:border-line-strong focus-visible:border-accent-text";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

export function SelectInput({
  value,
  onChange,
  options,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  id?: string;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${fieldClass} pe-8 [&>option]:bg-raised`}>
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
