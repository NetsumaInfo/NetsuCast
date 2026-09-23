import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Every file in src/locales is a language; French is the source and the fallback. Each one is its
// own chunk, loaded when used: startup parses one language (plus French), not seventeen.
const files = import.meta.glob<{ default: Record<string, unknown> }>("./locales/*.json");
const loaders = Object.fromEntries(Object.entries(files).map(([path, load]) => [path.match(/([\w-]+)\.json$/)![1], load]));

/** The language setting, mirrored here so the first frame is already in the right language. */
const STORAGE_KEY = "netsucast.language";

/** Languages offered in the settings, each in its own name. */
export const LANGUAGES: { code: string; name: string }[] = [
  { code: "fr", name: "Français" },
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
  { code: "pt-BR", name: "Português (Brasil)" },
  { code: "nl", name: "Nederlands" },
  { code: "pl", name: "Polski" },
  { code: "ru", name: "Русский" },
  { code: "uk", name: "Українська" },
  { code: "tr", name: "Türkçe" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "zh-CN", name: "简体中文" },
  { code: "zh-TW", name: "繁體中文" },
  { code: "ar", name: "العربية" },
  { code: "he", name: "עברית" },
].filter((l) => l.code in loaders);

const RTL = new Set(["ar", "he"]);

/** "auto" follows the system: exact match first (zh-TW), then the base language (pt → pt-BR). */
export function resolveLanguage(setting: string): string {
  if (setting !== "auto" && setting in loaders) return setting;
  for (const wanted of navigator.languages ?? [navigator.language]) {
    if (wanted in loaders) return wanted;
    const base = wanted.split("-")[0];
    if (base === "zh") return /TW|HK|MO|Hant/i.test(wanted) ? "zh-TW" : "zh-CN";
    const match = Object.keys(loaders).find((code) => code.split("-")[0] === base);
    if (match) return match;
  }
  return "fr";
}

async function loadLanguage(code: string) {
  if (i18n.hasResourceBundle(code, "translation")) return;
  i18n.addResourceBundle(code, "translation", (await loaders[code]()).default);
}

export async function applyLanguage(setting: string) {
  const lang = resolveLanguage(setting);
  try {
    localStorage.setItem(STORAGE_KEY, setting);
  } catch {
    // only the first frame of the next launch depends on it
  }
  await loadLanguage(lang);
  await i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL.has(lang) ? "rtl" : "ltr";
}

/** Loads the last used language and French before the first render. */
export async function initI18n() {
  let setting = "auto";
  try {
    setting = localStorage.getItem(STORAGE_KEY) ?? "auto";
  } catch {
    // storage unavailable: the system language
  }
  await i18n.use(initReactI18next).init({
    resources: {},
    lng: resolveLanguage(setting),
    fallbackLng: "fr",
    interpolation: { escapeValue: false },
    returnNull: false,
    partialBundledLanguages: true,
  });
  await loadLanguage("fr");
  await applyLanguage(setting);
}

export default i18n;
