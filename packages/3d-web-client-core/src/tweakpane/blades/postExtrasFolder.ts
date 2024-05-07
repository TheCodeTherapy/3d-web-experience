import { BladeController, View } from "@tweakpane/core";
import { BloomEffect } from "postprocessing";
import { BladeApi, FolderApi, TpChangeEvent } from "tweakpane";

import { GaussGrainEffect } from "../../rendering/post-effects/gauss-grain";

export const extrasValues = {
  grain: 0.045,
  bloom: 0.75,
};

const extrasOptions = {
  grain: {
    amount: { min: 0, max: 0.2, step: 0.002 },
  },
  bloom: {
    amount: { min: 0, max: 50, step: 0.05 },
  },
};

export class PostExtrasFolder {
  private folder: FolderApi;
  constructor(parentFolder: FolderApi, expand: boolean = false) {
    this.folder = parentFolder.addFolder({ title: "bloom / grain", expanded: expand });
    this.folder.addBinding(extrasValues, "bloom", extrasOptions.bloom.amount);
    this.folder.addBinding(extrasValues, "grain", extrasOptions.grain.amount);
  }

  public setupChangeEvent(
    bloomEffect: BloomEffect,
    gaussGrainEffect: typeof GaussGrainEffect,
  ): void {
    this.folder.on("change", (e: TpChangeEvent<unknown, BladeApi<BladeController<View>>>) => {
      const target = (e.target as any).key;
      if (!target) return;
      switch (target) {
        case "bloom":
          bloomEffect.intensity = e.value as number;
          break;
        case "grain":
          gaussGrainEffect.uniforms.amount.value = e.value as number;
          break;
        default:
          break;
      }
    });
  }
}
