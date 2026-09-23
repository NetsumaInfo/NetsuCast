import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { HandHeart } from "lucide-react";
import { DISCORD_INVITE } from "../lib/community";
import { DiscordIcon } from "./BrandIcons";
import { IconButton } from "./ui";

/**
 * The Discord server and support, as in NetsuBoard and NetsuRush. Support opens Settings ▸ About,
 * which holds both donation pages and lets the person pick, rather than one page straight away.
 */
export function HeaderLinks({ onSupport }: { onSupport: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <IconButton aria-label={t("header.discord")} onClick={() => void openUrl(DISCORD_INVITE)}>
        <DiscordIcon className="text-ink-muted" />
      </IconButton>
      <IconButton aria-label={t("header.support")} onClick={onSupport}>
        <HandHeart size={18} strokeWidth={1.75} className="text-ink-muted" />
      </IconButton>
    </>
  );
}
