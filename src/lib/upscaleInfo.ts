import type { PlayerState } from "../hooks/usePlayer";
import type { Upscale } from "./player";

export type UpscaleSummary = {
  status: "off" | "preparing" | "measuring" | "inactive" | "active";
  /** 2 or 4 when active. */
  factor: number;
  /** Resolution produced by ArtCNN, before mpv scales it to the window. */
  upscaledWidth: number;
  upscaledHeight: number;
};

/** What really happens to the picture, from mpv's measured render passes. */
export function summarize(state: PlayerState, upscale: Upscale, preparing: boolean): UpscaleSummary {
  const none = { factor: 1, upscaledWidth: state.videoWidth, upscaledHeight: state.videoHeight };
  if (upscale.model === "off") return { status: "off", ...none };
  if (preparing) return { status: "preparing", ...none };
  if (!state.upscale) return { status: "measuring", ...none };
  if (state.upscale.passes === 0) return { status: "inactive", ...none };
  const factor = 2 ** state.upscale.passes;
  return {
    status: "active",
    factor,
    upscaledWidth: state.videoWidth * factor,
    upscaledHeight: state.videoHeight * factor,
  };
}

export const modelName = (model: string) => model.replace("_", " ");
