import { useTranslation } from "react-i18next";
import { Bug, Gauge, Sparkles, Wrench } from "lucide-react";
import { CHANGE_KINDS, releaseText, type ChangeKind, type Release } from "../lib/releases";

// One release, grouped by kind: the "What's new" dialog and the history in Settings ▸ Updates
// share it, so both classify a release the same way.
const SECTIONS: Record<ChangeKind, { icon: typeof Sparkles; tone: string; label: string }> = {
  feature: { icon: Sparkles, tone: "text-accent-text", label: "update.kind.feature" },
  improvement: { icon: Wrench, tone: "text-ink", label: "update.kind.improvement" },
  performance: { icon: Gauge, tone: "text-success", label: "update.kind.performance" },
  fix: { icon: Bug, tone: "text-ink-muted", label: "update.kind.fix" },
};

export function ReleaseNotes({ release, compact = false }: { release: Release; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const groups = CHANGE_KINDS.map((kind) => ({ kind, ...SECTIONS[kind], entries: release.changes.filter((c) => c.kind === kind) })).filter(
    (g) => g.entries.length,
  );

  return (
    <div className={`flex flex-col ${compact ? "gap-3" : "gap-5"}`}>
      {groups.map(({ kind, icon: Icon, tone, label, entries }) => (
        <section key={kind}>
          <h4 className={`flex items-center gap-2 font-medium text-ink ${compact ? "text-xs" : "text-sm"}`}>
            <Icon size={compact ? 14 : 16} strokeWidth={1.75} className={`shrink-0 ${tone}`} />
            {t(label)}
            <span className="text-xs font-normal text-ink-muted">{entries.length}</span>
          </h4>
          <ul className={`mt-1.5 list-disc text-ink-muted ${compact ? "space-y-1 ps-6 text-xs" : "space-y-2 ps-7 text-sm"}`}>
            {entries.map((change) => (
              <li key={change.en}>{releaseText(change, i18n.language)}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
