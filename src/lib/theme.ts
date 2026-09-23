// Colour themes (blocks at the end of src/index.css). The choice is saved with the settings; a
// copy in localStorage lets main.tsx apply it before the first paint, before the settings load.

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
  if (root.dataset.theme === theme) return;
  // No colour transition runs between the two palettes.
  root.classList.add("theme-switching");
  root.dataset.theme = theme;
  void root.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
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
