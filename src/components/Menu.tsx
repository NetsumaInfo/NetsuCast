import { useEffect, useRef, type ReactNode } from "react";
import { Check } from "lucide-react";

export type MenuItem = { key: string; label: string; hint?: string; active?: boolean; onSelect: () => void };

type Props = {
  id: string;
  open: string | null;
  setOpen: (id: string | null) => void;
  icon: ReactNode;
  title: string;
  items: MenuItem[];
  badge?: string;
};

/** Icon button with a popover list above it. One menu open at a time (`open` holds its id). */
export function Menu({ id, open, setOpen, icon, title, items, badge }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const isOpen = open === id;

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [isOpen, setOpen]);

  return (
    <div ref={ref} className="relative">
      <IconButton title={title} active={isOpen} onClick={() => setOpen(isOpen ? null : id)}>
        {icon}
        {badge && (
          <span className="absolute -top-1 -right-1 rounded bg-violet-500 px-1 text-[9px] leading-3 font-bold text-white">
            {badge}
          </span>
        )}
      </IconButton>
      {isOpen && (
        <div className="absolute right-0 bottom-full mb-3 max-h-[60vh] min-w-56 overflow-y-auto rounded-xl border border-white/10 bg-neutral-900/95 p-1.5 shadow-2xl backdrop-blur">
          <div className="px-3 pt-1.5 pb-2 text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">{title}</div>
          {items.length === 0 && <div className="px-3 py-2 text-sm text-neutral-500">Rien de disponible</div>}
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                item.onSelect();
                setOpen(null);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-neutral-200 hover:bg-white/10"
            >
              <span className="w-4 shrink-0 text-violet-400">{item.active && <Check size={16} />}</span>
              <span className="flex-1">{item.label}</span>
              {item.hint && <span className="text-xs text-neutral-500">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function IconButton({
  title,
  onClick,
  active,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`relative grid size-9 place-items-center rounded-lg text-neutral-100 transition hover:bg-white/15 ${active ? "bg-white/15" : ""}`}
    >
      {children}
    </button>
  );
}
