// The extension's options page (chrome://extensions ▸ NetsuCast ▸ Extension options).
import { mountSettings } from "./settings.js";

const t = (key) => chrome.i18n.getMessage(key);
document.documentElement.lang = t("langTag") || "fr";
document.documentElement.dir = t("@@bidi_dir") || "ltr";
for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
mountSettings(document.getElementById("settings-list"));
