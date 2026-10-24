// The extension's settings, drawn into `container`: in the popup (gear button), in its own
// window (right-click on the toolbar icon ▸ Settings) and on the extension's options page.
import { DEFAULT_PORT, getPort, getPrefs, setPref } from "./common.js";

const t = (key, subs) => chrome.i18n.getMessage(key, subs);

function row(labelText, control, hint) {
  const li = document.createElement("li");
  li.className = "setting";
  const text = document.createElement("div");
  text.className = "info";
  const label = document.createElement("div");
  label.className = "label";
  label.textContent = labelText;
  label.id = `label-${crypto.randomUUID()}`;
  text.append(label);
  if (hint) {
    const small = document.createElement("div");
    small.className = "host";
    small.textContent = hint;
    text.append(small);
  }
  control.setAttribute("aria-labelledby", label.id);
  li.append(text, control);
  return li;
}

function toggle(checked, onChange) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("role", "switch");
  input.className = "switch";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return input;
}

/** Two or three choices side by side, one selected. */
function choice(options, value, onChange) {
  const group = document.createElement("div");
  group.className = "segmented";
  group.setAttribute("role", "radiogroup");
  for (const [optionValue, text] of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "radio");
    button.textContent = text;
    const select = () => {
      for (const b of group.children) b.setAttribute("aria-checked", String(b === button));
      onChange(optionValue);
    };
    button.setAttribute("aria-checked", String(optionValue === value));
    button.addEventListener("click", select);
    group.append(button);
  }
  return group;
}

/**
 * `site`: hostname of the tab the settings were opened from, for the "on this site" switch
 * (null on the options page). `onPort`: called after the port changed.
 */
export async function mountSettings(container, { site = null, onPort } = {}) {
  const prefs = await getPrefs();
  const list = document.createElement("ul");
  list.className = "settings";

  const siteRow = site
    ? row(
        t("setButtonOnSite", [site]),
        toggle(!prefs.hiddenSites.includes(site), async (on) => {
          const sites = (await getPrefs()).hiddenSites.filter((s) => s !== site);
          await setPref("hiddenSites", on ? sites : [...sites, site]);
        }),
      )
    : null;
  const showSiteRow = (on) => siteRow && (siteRow.hidden = !on);

  list.append(
    row(t("setCastButton"), toggle(prefs.castButton, (on) => {
      setPref("castButton", on);
      showSiteRow(on);
    }), t("setCastButtonHint")),
  );
  if (siteRow) list.append(siteRow);
  showSiteRow(prefs.castButton);
  list.append(
    row(
      t("setButtonCorner"),
      choice([["left", t("setCornerLeft")], ["right", t("setCornerRight")]], prefs.buttonCorner, (v) => setPref("buttonCorner", v)),
    ),
    row(t("setHideFullscreen"), toggle(prefs.hideInFullscreen, (on) => setPref("hideInFullscreen", on))),
    row(t("setIconClick"), choice([["cast", t("setIconCast")], ["menu", t("setIconMenu")]], prefs.iconClick, (v) => setPref("iconClick", v))),
    row(t("setPauseOnCast"), toggle(prefs.pauseOnCast, (on) => setPref("pauseOnCast", on))),
    row(t("setSendPosition"), toggle(prefs.sendPosition, (on) => setPref("sendPosition", on)), t("setSendPositionHint")),
    row(t("setContextMenu"), toggle(prefs.contextMenu, (on) => setPref("contextMenu", on)), t("menuPlay")),
  );

  if (prefs.hiddenSites.length && !site) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = t("setShowEverywhere");
    reset.addEventListener("click", async () => {
      await setPref("hiddenSites", []);
      reset.closest("li").remove();
    });
    list.append(row(t("setHiddenSites", [String(prefs.hiddenSites.length)]), reset, prefs.hiddenSites.join(", ")));
  }

  // Chrome owns shortcuts: shown here, changed on its own page.
  const command = (await chrome.commands.getAll()).find((c) => c.name === "cast-video");
  const change = document.createElement("button");
  change.type = "button";
  change.textContent = t("setShortcutChange");
  change.addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));
  list.append(row(t("setShortcut"), change, command?.shortcut || t("setShortcutNone")));

  const port = document.createElement("input");
  port.type = "number";
  port.min = "1";
  port.max = "65535";
  port.className = "port";
  port.value = await getPort();
  port.addEventListener("change", async () => {
    await chrome.storage.local.set({ port: Number(port.value) || DEFAULT_PORT });
    onPort?.();
  });
  list.append(row(t("popupPort"), port, t("setPortHint")));

  container.replaceChildren(list);
}
