import { BladeController, View } from "@tweakpane/core";
import { BloomEffect } from "postprocessing";
import { BladeApi, FolderApi, TpChangeEvent } from "tweakpane";

import { GaussGrainEffect } from "../../../rendering/post-effects/gauss-grain";

export const bloomAndGrainValues = {
  grain: 0.045,
  bloom: 0.15,
};

const bloomAndGrainOptions = {
  grain: {
    amount: { min: 0, max: 0.2, step: 0.002 },
  },
  bloom: {
    amount: { min: 0, max: 50, step: 0.05 },
  },
};

export class BloomAndGrainFolder {
  private folder: FolderApi;
  constructor(parentFolder: FolderApi, expand: boolean = false) {
    this.folder = parentFolder.addFolder({ title: "bloom / grain", expanded: expand });
    this.folder.addBinding(bloomAndGrainValues, "bloom", bloomAndGrainOptions.bloom.amount);
    this.folder.addBinding(bloomAndGrainValues, "grain", bloomAndGrainOptions.grain.amount);
  }

  public setupChangeEvent(
    bloomEffect: BloomEffect | any,
    gaussGrainEffect: typeof GaussGrainEffect | any,
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
