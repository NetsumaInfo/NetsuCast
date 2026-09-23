import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

// Shared primitives. Tooltips are drawn by <TooltipLayer/>: any element with `data-tip` (and
// optionally `data-tip-key` for its shortcut, `data-tip-side` for another side than the top) gets
// one on hover and on keyboard focus.

type IconButtonProps = {
  /** The action, as a verb: the accessible name and the tooltip. */
  "aria-label": string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  /** Kept focusable and hoverable (aria-disabled) so the tooltip can say why. */
  disabled?: boolean;
  disabledReason?: string;
  children: ReactNode;
  className?: string;
};

export function IconButton({ "aria-label": label, shortcut, onClick, active, disabled, disabledReason, children, className = "" }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      aria-disabled={disabled || undefined}
      data-tip={disabled && disabledReason ? `${label} · ${disabledReason}` : label}
      data-tip-key={disabled ? undefined : shortcut}
      onClick={disabled ? undefined : onClick}
      className={`relative grid size-9 shrink-0 place-items-center rounded-control text-ink transition-colors ${disabled ? "opacity-40" : "hover:bg-ink/12 active:bg-ink/18"} ${active ? "bg-ink/12 text-accent-text" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

type Side = "top" | "bottom" | "left" | "right";
type Tip = { text: string; key?: string; anchor: DOMRect; side: Side };
type Placement = { x: number; y: number; side: Side; arrow: number };

const GAP = 8; // bubble to trigger, the arrow sits in it
const EDGE = 8; // minimum distance to the window edge
const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

/** Where the bubble goes: the side asked for, the opposite one when the window ends first, then
 *  slid along the edge so it stays inside; the arrow keeps pointing at the trigger. */
function place(anchor: DOMRect, width: number, height: number, wanted: Side): Placement {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const fits: Record<Side, boolean> = {
    top: anchor.top - GAP - height >= EDGE,
    bottom: anchor.bottom + GAP + height <= H - EDGE,
    left: anchor.left - GAP - width >= EDGE,
    right: anchor.right + GAP + width <= W - EDGE,
  };
  const side = fits[wanted] || !fits[OPPOSITE[wanted]] ? wanted : OPPOSITE[wanted];
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));
  if (side === "top" || side === "bottom") {
    const x = clamp(anchor.left + anchor.width / 2 - width / 2, EDGE, W - EDGE - width);
    const y = side === "top" ? anchor.top - GAP - height : anchor.bottom + GAP;
    return { x, y, side, arrow: clamp(anchor.left + anchor.width / 2 - x, 12, width - 12) };
  }
  const y = clamp(anchor.top + anchor.height / 2 - height / 2, EDGE, H - EDGE - height);
  const x = side === "left" ? anchor.left - GAP - width : anchor.right + GAP;
  return { x, y, side, arrow: clamp(anchor.top + anchor.height / 2 - y, 12, height - 12) };
}

// The arrow's position and rotation per side, and the direction the bubble slides in from.
const ARROW: Record<Side, (at: number) => CSSProperties> = {
  top: (at) => ({ bottom: -8, left: at - 10, transform: "rotate(180deg)" }),
  bottom: (at) => ({ top: -8, left: at - 10 }),
  left: (at) => ({ right: -13, top: at - 5, transform: "rotate(90deg)" }),
  right: (at) => ({ left: -13, top: at - 5, transform: "rotate(-90deg)" }),
};
const SLIDE: Record<Side, string> = { top: "0 6px", bottom: "0 -6px", left: "6px 0", right: "-6px 0" };

/**
 * One tooltip for the whole app, drawn like NetsuBoard's and NetsuRush's (Base UI): it opens at
 * once, points at its trigger with a bordered arrow, flips to the other side at the window edge,
 * slides along it rather than leave the window, and fades in with a slight zoom from the arrow.
 * Follows hover and keyboard focus; Escape or a click closes it.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [pos, setPos] = useState<Placement | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const current = useRef<Element | null>(null);

  useEffect(() => {
    const show = (el: Element) => {
      current.current = el;
      setPos(null);
      setTip({
        text: el.getAttribute("data-tip") ?? "",
        key: el.getAttribute("data-tip-key") ?? undefined,
        anchor: el.getBoundingClientRect(),
        side: (el.getAttribute("data-tip-side") as Side | null) ?? "top",
      });
    };
    const hide = () => {
      current.current = null;
      setTip(null);
    };
    const target = (e: Event) => (e.target as Element | null)?.closest?.("[data-tip]") ?? null;

    const onOver = (e: PointerEvent) => {
      const el = target(e);
      if (el && el !== current.current) show(el);
      if (!el && current.current) hide();
    };
    const onFocus = (e: FocusEvent) => {
      const el = target(e);
      if (el && (e.target as Element).matches(":focus-visible")) show(el);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Measured before paint, so the bubble never shows at the wrong place for a frame.
  useLayoutEffect(() => {
    if (!tip || !bubble.current) return;
    setPos(place(tip.anchor, bubble.current.offsetWidth, bubble.current.offsetHeight, tip.side));
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={bubble}
      key={`${tip.text}${tip.anchor.x}${tip.anchor.y}`}
      id="nc-tooltip"
      role="tooltip"
      style={{
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        visibility: pos ? "visible" : "hidden",
        ["--tip-from" as string]: pos ? SLIDE[pos.side] : "0 0",
        transformOrigin: pos ? OPPOSITE[pos.side] : undefined,
      }}
      className={`pointer-events-none fixed z-[100] flex w-max max-w-52 items-center gap-2 rounded-control border border-line bg-overlay px-2.5 py-1.5 text-xs break-words text-ink shadow-md ${pos ? "animate-tip-in" : ""}`}
    >
      <span className="min-w-0">{tip.text}</span>
      {tip.key && <Kbd>{tip.key}</Kbd>}
      {pos && (
        <svg width="20" height="10" viewBox="0 0 20 10" fill="none" aria-hidden="true" className="absolute" style={ARROW[pos.side](pos.arrow)}>
          <path
            d="M9.66437 2.60207L4.80758 6.97318C4.07308 7.63423 3.11989 8 2.13172 8H0V10H20V8H18.5349C17.5468 8 16.5936 7.63423 15.8591 6.97318L11.0023 2.60207C10.622 2.2598 10.0447 2.25979 9.66437 2.60207Z"
            className="fill-overlay"
          />
          <path
            d="M8.99542 1.85876C9.75604 1.17425 10.9106 1.17422 11.6713 1.85878L16.5281 6.22989C17.0789 6.72568 17.7938 7.00001 18.5349 7.00001L15.89 7L11.0023 2.60207C10.622 2.2598 10.0447 2.2598 9.66437 2.60207L4.77907 7L2.13172 7.00001C2.87268 7.00001 3.58761 6.72568 4.13844 6.22989L8.99542 1.85876Z"
            className="fill-line"
          />
        </svg>
      )}
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

/**
 * A select drawn by the app, never the native Windows list. Listbox pattern: focus stays on the
 * button, arrows move the highlighted option, Enter or Space picks it, Escape closes the list
 * without closing the dialog around it. The list is portalled to <body> so no scrolling panel
 * clips it.
 */
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
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = Math.max(0, options.findIndex(([v]) => v === value));

  const show = () => {
    if (!button.current) return;
    setRect(button.current.getBoundingClientRect());
    setHighlight(selected);
    setOpen(true);
  };
  const pick = (index: number) => {
    onChange(options[index][0]);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.target instanceof Node && (list.current?.contains(e.target) || button.current?.contains(e.target))) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.children[highlight]?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    const keys: Record<string, () => void> = open
      ? {
          ArrowDown: () => setHighlight((h) => Math.min(last, h + 1)),
          ArrowUp: () => setHighlight((h) => Math.max(0, h - 1)),
          Home: () => setHighlight(0),
          End: () => setHighlight(last),
          Enter: () => pick(highlight),
          " ": () => pick(highlight),
          Escape: () => setOpen(false),
          Tab: () => setOpen(false),
        }
      : { ArrowDown: show, ArrowUp: show, Enter: show, " ": show };
    const action = keys[e.key];
    if (!action) return;
    if (e.key !== "Tab") {
      e.preventDefault();
      e.stopPropagation();
    }
    action();
  };

  // Below the button, or above it when the window ends first.
  const maxHeight = 280;
  const below = rect ? window.innerHeight - rect.bottom >= Math.min(maxHeight, options.length * 34 + 8) || rect.top < window.innerHeight / 2 : true;

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${highlight}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={`${fieldClass} flex items-center justify-between gap-2 text-start ${open ? "border-accent-text" : ""}`}
      >
        <span className="truncate">{options[selected]?.[1]}</span>
        <ChevronDown size={15} strokeWidth={1.75} className={`shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open &&
        rect &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-labelledby={id}
            style={{
              left: rect.left,
              width: rect.width,
              maxHeight,
              ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
            }}
            className="fixed z-[70] animate-fade-in overflow-y-auto rounded-control border border-line bg-overlay p-1 shadow-overlay"
          >
            {options.map(([v, label], i) => (
              <li
                key={v}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === selected}
                onPointerEnter={() => setHighlight(i)}
                onClick={() => pick(i)}
                className={`flex items-center gap-2 rounded-[4px] px-2 py-1.5 text-sm ${i === highlight ? "bg-ink/10 text-ink" : "text-ink-muted"}`}
              >
                <Check size={14} strokeWidth={2} className={`shrink-0 text-accent-text ${i === selected ? "" : "invisible"}`} />
                <span className="truncate">{label}</span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
