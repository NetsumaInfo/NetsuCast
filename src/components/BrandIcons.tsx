// Service logos from simple-icons (CC0), painted in currentColor: the caller picks the tint.
import { siBuymeacoffee, siDiscord, siGithub } from "simple-icons";

function Logo({ path, size = 18, className = "" }: { path: string; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

type IconProps = { size?: number; className?: string };

export const DiscordIcon = (p: IconProps) => <Logo path={siDiscord.path} {...p} />;
export const GithubIcon = (p: IconProps) => <Logo path={siGithub.path} {...p} />;
export const BuyMeACoffeeIcon = (p: IconProps) => <Logo path={siBuymeacoffee.path} {...p} />;
