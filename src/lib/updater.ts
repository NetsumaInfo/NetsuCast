// The updater, shared by the header button and Settings ▸ Updates so both always show the same
// phase and percentage. One silent check a few seconds after launch. With automatic updates (on
// by default), a new version downloads in the background and installs at the next launch
// (src-tauri/src/staged_update.rs); the corner button installs it right away. Without them, two
// clicks: download, then restart. Releases come from GitHub (latest.json), minisign-verified
// against the public key in tauri.conf.json before anything installs.

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";

/** "staged": downloaded and verified, installs at the next launch. */
export type UpdatePhase = "idle" | "checking" | "available" | "downloading" | "downloaded" | "staged" | "installing" | "current" | "error";

export type UpdaterState = {
  phase: UpdatePhase;
  /** The version found, when there is one. */
  version: string | null;
  notes: string | null;
  /** Exact percentage, 0 to 100; null when the server does not send a size. */
  progress: number | null;
  error: string | null;
  autoCheck: boolean;
  autoInstall: boolean;
};

const AUTO_CHECK_KEY = "netsucast.update.auto";
const AUTO_INSTALL_KEY = "netsucast.update.autoInstall";
// Progress events arrive per HTTP chunk (hundreds a second): publish at most every 80 ms.
const PROGRESS_INTERVAL_MS = 80;

function readFlag(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // not remembered: the default applies next launch
  }
}

let state: UpdaterState = {
  phase: "idle",
  version: null,
  notes: null,
  progress: null,
  error: null,
  autoCheck: readFlag(AUTO_CHECK_KEY, true),
  // On by default: the update never interrupts anything, it waits for the next launch.
  autoInstall: readFlag(AUTO_INSTALL_KEY, true),
};
const listeners = new Set<() => void>();
let pending: Update | null = null;

function set(patch: Partial<UpdaterState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

/** Outside the Tauri window (a plain browser during development) there is nothing to update. */
export const updaterAvailable = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function useUpdater(): UpdaterState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

export function setAutoCheck(autoCheck: boolean) {
  writeFlag(AUTO_CHECK_KEY, autoCheck);
  // Without the launch check nothing is found to install: the unattended install goes with it.
  if (!autoCheck) setAutoInstall(false);
  set({ autoCheck });
}

export function setAutoInstall(autoInstall: boolean) {
  writeFlag(AUTO_INSTALL_KEY, autoInstall);
  set({ autoInstall });
  // Turned off: a version already downloaded must not install at the next launch after all.
  if (!autoInstall && updaterAvailable()) {
    void invoke("discard_staged_update").catch(() => {});
    if (state.phase === "staged") set({ phase: "idle", version: null });
  }
  if (autoInstall && !state.autoCheck) setAutoCheck(true);
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function checkForUpdate({ silent = false } = {}) {
  if (!updaterAvailable()) return;
  // A download under way or done wins: checking again would drop the version already fetched.
  if (["checking", "downloading", "downloaded", "staged", "installing"].includes(state.phase)) return;
  if (!silent) set({ phase: "checking", error: null, progress: null });
  try {
    // Automatic: the launch check downloads in the background, nothing to click.
    if (silent && state.autoInstall) {
      const version = await invoke<string | null>("stage_update");
      set(version ? { phase: "staged", version } : { phase: "idle" });
      return;
    }
    const { check } = await import("@tauri-apps/plugin-updater");
    pending = await check({ timeout: 30_000 });
    if (!pending) {
      set({ phase: silent ? "idle" : "current", version: null, notes: null });
      return;
    }
    set({ phase: "available", version: pending.version, notes: pending.body ?? null });
  } catch (error) {
    // At launch, offline or an unreachable repository is not news anyone came for.
    set(silent ? { phase: "idle" } : { phase: "error", error: message(error) });
  }
}

export async function downloadUpdate() {
  if (!pending || state.phase !== "available") return;
  set({ phase: "downloading", progress: 0, error: null });
  let done = 0;
  let total = 0;
  let lastEmit = 0;
  try {
    await pending.download((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? 0;
        set({ progress: total > 0 ? 0 : null });
      } else if (event.event === "Progress") {
        done += event.data.chunkLength;
        const now = performance.now();
        if (now - lastEmit < PROGRESS_INTERVAL_MS) return;
        lastEmit = now;
        set({ progress: total > 0 ? Math.min(100, (done / total) * 100) : null });
      }
    });
    set({ phase: "downloaded", progress: 100 });
  } catch (error) {
    set({ phase: "error", error: message(error) });
  }
}

export async function installUpdate() {
  if (state.phase === "staged") {
    set({ phase: "installing", error: null });
    try {
      // Checks the signature again, starts the installer and exits: nothing returns on success.
      await invoke("install_staged_update");
    } catch (error) {
      set({ phase: "error", error: message(error) });
    }
    return;
  }
  if (!pending || state.phase !== "downloaded") return;
  set({ phase: "installing", error: null });
  try {
    // On success nothing runs after this: the plugin starts the NSIS installer (passive mode, see
    // tauri.conf.json) and exits; the installer relaunches NetsuCast. Only a failure before that
    // hand-off (bad signature, corrupt archive) comes back here, with the app untouched.
    await pending.install();
  } catch (error) {
    set({ phase: "error", error: message(error) });
  }
}

let scheduled = false;

/** The launch check: once per session, a few seconds in, when the webview is idle. Silent. */
export function scheduleLaunchCheck() {
  if (scheduled || !updaterAvailable() || import.meta.env.DEV) return;
  scheduled = true;
  if (!state.autoCheck) return;
  const run = () => void checkForUpdate({ silent: true });
  window.setTimeout(() => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 10_000 });
    else run();
  }, 6_000);
}
