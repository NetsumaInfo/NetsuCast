import { useEffect, useRef, type ReactNode } from "react";
import { Check } from "lucide-react";
import { IconButton } from "./ui";

export type MenuItem = {
  key: string;
  label: string;
  hint?: string;
  active?: boolean;
  /** Items sharing a group sit together; a new group starts after a divider and its title. */
  group?: string;
  onSelect: () => void;
};

type Props = {
  id: string;
  open: string | null;
  setOpen: (id: string | null) => void;
  icon: ReactNode;
  title: string;
  shortcut?: string;
  items: MenuItem[];
  badge?: string;
  emptyText: string;
};

/** Icon button with a list above it. One menu open at a time (`open` holds its id). */
export function Menu({ id, open, setOpen, icon, title, shortcut, items, badge, emptyText }: Props) {
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
      <IconButton aria-label={title} shortcut={shortcut} active={isOpen} onClick={() => setOpen(isOpen ? null : id)}>
        {icon}
        {badge && (
          <span className="absolute -top-0.5 -end-0.5 rounded-sm bg-accent px-1 text-[9px] leading-3.5 font-semibold text-accent-ink tabular-nums">
            {badge}
          </span>
        )}
      </IconButton>
      {isOpen && (
        <div
          role="menu"
          aria-label={title}
          className="absolute end-0 bottom-full mb-2 max-h-[60vh] min-w-60 animate-fade-in overflow-y-auto rounded-panel border border-line bg-overlay p-1 shadow-overlay"
        >
          <div className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-ink-muted">{title}</div>
          {items.length === 0 && <div className="px-2.5 py-2 text-sm text-ink-faint">{emptyText}</div>}
          {items.map((item, i) => {
            const newGroup = i > 0 && item.group !== items[i - 1].group;
            return (
              <div key={item.key}>
                {newGroup && (
                  <>
                    <div className="mx-2 my-1 h-px bg-line" />
                    {item.group && <div className="px-2.5 pt-1 pb-1 text-xs font-medium text-ink-muted">{item.group}</div>}
                  </>
                )}
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={!!item.active}
                  onClick={() => {
                    item.onSelect();
                    setOpen(null);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-start text-sm transition-colors hover:bg-ink/8 ${item.active ? "text-ink" : "text-ink-muted hover:text-ink"}`}
                >
                  <span className="w-4 shrink-0 text-accent-text">{item.active && <Check size={15} strokeWidth={2} />}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.hint && <span className="text-xs text-ink-faint">{item.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
