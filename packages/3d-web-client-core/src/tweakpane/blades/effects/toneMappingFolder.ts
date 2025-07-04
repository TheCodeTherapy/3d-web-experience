import { BindingApi, BladeApi, BladeController, TpChangeEvent, View } from "@tweakpane/core";
import { ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { FolderApi } from "tweakpane";

export const toneMappingValues = {
  mode: 7 as ToneMappingMode,
  resolution: 512,
  whitePoint: 32.0,
  middleGrey: 21.0,
  minLuminance: 0.01,
  averageLuminance: 0.01,
  adaptationRate: 2.0,
};

const toneMappingOptions = {
  mode: { min: 0, max: 8, step: 1 },
  resolution: { min: 64, max: 512, step: 64 },
  whitePoint: { min: 0, max: 32, step: 0.01 },
  middleGrey: { min: 0, max: 32, step: 0.01 },
  minLuminance: { min: 0, max: 32, step: 0.001 },
  averageLuminance: { min: 0.001, max: 2, step: 0.001 },
  adaptationRate: { min: 0.1, max: 2.0, step: 0.1 },
};

const customToneMappingTypes: Record<number, string> = {
  0: "LINEAR",
  1: "REINHARD",
  2: "REINHARD2",
  3: "REINHARD2_ADAPTIVE",
  4: "UNCHARTED2",
  5: "OPTIMIZED_CINEON",
  6: "ACES_FILMIC",
  7: "AGX",
  8: "NEUTRAL",
};

const customToneMappingBlade = {
  customToneMappingType: customToneMappingTypes[toneMappingValues.mode],
};

const setCustomToneMappingType = (value: number): void => {
  customToneMappingBlade.customToneMappingType = customToneMappingTypes[value];
};

export class ToneMappingFolder {
  public folder: FolderApi;
  private minLuminance: BindingApi;
  private avgLuminance: BindingApi;

  constructor(parentFolder: FolderApi, expand: boolean = false) {
    this.folder = parentFolder.addFolder({
      title: "customToneMapping",
      expanded: expand,
    });
    this.folder.addBinding(toneMappingValues, "mode", toneMappingOptions.mode);
    this.folder.addBinding(customToneMappingBlade, "customToneMappingType", { readonly: true });
    this.folder.addBinding(toneMappingValues, "whitePoint", toneMappingOptions.whitePoint);
    this.folder.addBinding(toneMappingValues, "middleGrey", toneMappingOptions.middleGrey);
    this.minLuminance = this.folder.addBinding(
      toneMappingValues,
      "minLuminance",
      toneMappingOptions.minLuminance,
    );
    this.minLuminance.hidden = false;
    this.avgLuminance = this.folder.addBinding(
      toneMappingValues,
      "averageLuminance",
      toneMappingOptions.averageLuminance,
    );
    this.avgLuminance.hidden = false;
    this.folder.addBinding(toneMappingValues, "adaptationRate", toneMappingOptions.adaptationRate);
  }

  public setupChangeEvent(toneMappingEffect: ToneMappingEffect | any): void {
    this.folder.on("change", (e: TpChangeEvent<unknown, BladeApi<BladeController<View>>>) => {
      const target = (e.target as any).key;
      if (!target) return;
      if (target === "mode") {
        setCustomToneMappingType(e.value as number);
      }
      (toneMappingEffect as any)[target] = e.value;
      return;
    });
  }
}
