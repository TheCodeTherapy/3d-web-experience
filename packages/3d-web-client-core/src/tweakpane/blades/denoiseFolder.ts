import { BladeController, View } from "@tweakpane/core";
import { BladeApi, FolderApi, TpChangeEvent } from "tweakpane";

import { DenoiseEffect } from "../../rendering/post-effects/denoiose";

export const denoiseValues = {
  distBias: 0.6,
  tolerance: 20.0,
  multiplier: 1.5,
  amount: 0.42,
};

const denoiseOptions = {
  distBias: { min: 0.01, max: 0.85, step: 0.01 },
  tolerance: { min: 0.01, max: 20, step: 0.01 },
  multiplier: { min: 0.01, max: 5, step: 0.1 },
  amount: { min: 0, max: 1, step: 0.01 },
};

export class DenoiseFolder {
  private folder: FolderApi;
  constructor(parentFolder: FolderApi, expand: boolean = false) {
    this.folder = parentFolder.addFolder({ title: "denoise", expanded: expand });
    this.folder.addBinding(denoiseValues, "distBias", denoiseOptions.distBias);
    this.folder.addBinding(denoiseValues, "tolerance", denoiseOptions.tolerance);
    this.folder.addBinding(denoiseValues, "multiplier", denoiseOptions.multiplier);
    this.folder.addBinding(denoiseValues, "amount", denoiseOptions.amount);
  }

  public setupChangeEvent(denoiseEffect: typeof DenoiseEffect): void {
    this.folder.on("change", (e: TpChangeEvent<unknown, BladeApi<BladeController<View>>>) => {
      const target = (e.target as any).key;
      if (!target) return;
      switch (target) {
        case "distBias":
          denoiseEffect.uniforms.distBias.value = e.value as number;
          break;
        case "tolerance":
          denoiseEffect.uniforms.tolerance.value = e.value as number;
          break;
        case "multiplier":
          denoiseEffect.uniforms.multiplier.value = e.value as number;
          break;
        case "amount":
          denoiseEffect.uniforms.amount.value = e.value as number;
          break;
        default:
          break;
      }
    });
  }
}
