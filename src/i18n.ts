import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Every file in src/locales is a language; French is the source and the fallback. The app is
// small, so all languages are bundled: switching is instant and works offline.
const files = import.meta.glob<{ default: Record<string, unknown> }>("./locales/*.json", { eager: true });

const resources = Object.fromEntries(
  Object.entries(files).map(([path, mod]) => [path.match(/([\w-]+)\.json$/)![1], { translation: mod.default }]),
);

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
].filter((l) => l.code in resources);

const RTL = new Set(["ar", "he"]);

/** "auto" follows the system: exact match first (zh-TW), then the base language (pt → pt-BR). */
export function resolveLanguage(setting: string): string {
  if (setting !== "auto" && setting in resources) return setting;
  for (const wanted of navigator.languages ?? [navigator.language]) {
    if (wanted in resources) return wanted;
    const base = wanted.split("-")[0];
    if (base === "zh") return /TW|HK|MO|Hant/i.test(wanted) ? "zh-TW" : "zh-CN";
    const match = Object.keys(resources).find((code) => code.split("-")[0] === base);
    if (match) return match;
  }
  return "fr";
}

export function applyLanguage(setting: string) {
  const lang = resolveLanguage(setting);
  i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL.has(lang) ? "rtl" : "ltr";
}

i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage("auto"),
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
