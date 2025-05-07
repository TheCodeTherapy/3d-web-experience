import { BladeController, View } from "@tweakpane/core";
import { BladeApi, FolderApi, TpChangeEvent } from "tweakpane";

export const characterValues = {
  metalness: 0.2,
  roughness: 0.8,
  emissive: { r: 1.0, g: 1.0, b: 1.0 },
  emissiveIntensity: 0.01,
  envMapIntensity: 0.21,
};

const characterOptions = {
  metalness: { min: 0, max: 1, step: 0.01 },
  roughness: { min: 0, max: 1, step: 0.01 },
  emissiveIntensity: { min: 0, max: 1, step: 0.01 },
  envMapIntensity: { min: 0, max: 1, step: 0.01 },
};

export class CharacterFolder {
  private folder: FolderApi;
  constructor(parentFolder: FolderApi, expand: boolean = false) {
    this.folder = parentFolder.addFolder({ title: "characterMaterial", expanded: expand });
    this.folder.addBinding(characterValues, "metalness", characterOptions.metalness);
    this.folder.addBinding(characterValues, "roughness", characterOptions.roughness);
    this.folder.addBinding(characterValues, "emissive", {
      color: { type: "float" },
    });
    this.folder.addBinding(
      characterValues,
      "emissiveIntensity",
      characterOptions.emissiveIntensity,
    );
    this.folder.addBinding(characterValues, "envMapIntensity", characterOptions.envMapIntensity);
  }

  public setupChangeEvent(): void {
    this.folder.on("change", (e: TpChangeEvent<unknown, BladeApi<BladeController<View>>>) => {
      const target = (e.target as any).key;
      if (!target) return;
      switch (target) {
        case "emissive": {
          const value = e.value as { r: number; g: number; b: number };
          characterValues.emissive = {
            r: value.r,
            g: value.g,
            b: value.b,
          };
          break;
        }
        default: {
          break;
        }
      }
    });
  }
}
