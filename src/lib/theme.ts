// Colour themes (blocks at the end of src/index.css). The choice is saved with the settings; a
// copy in localStorage lets main.tsx apply it before the first paint, before the settings load.
// The extension gets the same colours through the receiver (/ping), so its button matches.

import { invoke } from "@tauri-apps/api/core";

const SHARED_TOKENS = ["accent", "accent-hover", "accent-ink", "accent-text", "surface", "raised", "overlay", "ink", "ink-muted", "line", "line-strong", "danger", "success"];

function shareWithExtension(mode: string) {
  const style = getComputedStyle(document.documentElement);
  const theme: Record<string, string> = { scheme: mode };
  for (const token of SHARED_TOKENS) theme[token] = style.getPropertyValue(`--color-${token}`).trim();
  invoke("set_extension_theme", { theme }).catch(() => {});
}

// `label` is the i18n key, written out so scripts/check-i18n.mjs sees it used.
export const THEMES = [
  { id: "dark", mode: "dark", label: "themes.dark" },
  { id: "midnight", mode: "dark", label: "themes.midnight" },
  { id: "blue", mode: "dark", label: "themes.blue" },
  { id: "graphite", mode: "dark", label: "themes.graphite" },
  { id: "forest", mode: "dark", label: "themes.forest" },
  { id: "ember", mode: "dark", label: "themes.ember" },
  { id: "plum", mode: "dark", label: "themes.plum" },
  { id: "contrast", mode: "dark", label: "themes.contrast" },
  { id: "light", mode: "light", label: "themes.light" },
  { id: "soft-light", mode: "light", label: "themes.softLight" },
  { id: "paper", mode: "light", label: "themes.paper" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const STORAGE_KEY = "netsucast.theme";

export const isTheme = (id: string): id is ThemeId => THEMES.some((t) => t.id === id);

export function applyTheme(id: string) {
  const theme = isTheme(id) ? id : "dark";
  const root = document.documentElement;
  const mode = THEMES.find((t) => t.id === theme)?.mode ?? "dark";
  if (root.dataset.theme === theme) {
    shareWithExtension(mode); // first call at startup: main.tsx already set the attribute
    return;
  }
  // No colour transition runs between the two palettes.
  root.classList.add("theme-switching");
  root.dataset.theme = theme;
  void root.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
  shareWithExtension(mode);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // the settings file still has it; only the first frame of the next launch uses this copy
  }
}

/** The last theme used, for the first paint. */
export function savedTheme(): ThemeId {
  try {
    const id = localStorage.getItem(STORAGE_KEY) ?? "";
    return isTheme(id) ? id : "dark";
  } catch {
    return "dark";
  }
}
