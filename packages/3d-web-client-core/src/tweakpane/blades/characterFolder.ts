import { BladeController, View } from "@tweakpane/core";
import { BladeApi, FolderApi, TpChangeEvent } from "tweakpane";

export const characterValues = {
  transmission: 0.01,
  metalness: 0.8,
  roughness: 0.05,
  ior: 1.0,
  thickness: 0.1,
  specularColor: { r: 1.0, g: 1.0, b: 1.0 },
  specularIntensity: 0.1,
  emissive: { r: 1.0, g: 1.0, b: 1.0 },
  emissiveIntensity: 0.1,
  envMapIntensity: 0.8,
  sheenColor: { r: 1.0, g: 1.0, b: 1.0 },
  sheen: 0.5,
  clearcoat: 0.0,
  clearcoatRoughness: 0.0,
};

const characterOptions = {
  transmission: { min: 0.01, max: 3, step: 0.01 },
  metalness: { min: 0, max: 1, step: 0.01 },
  roughness: { min: 0, max: 1, step: 0.01 },
  ior: { min: 1, max: 5, step: 0.01 },
  thickness: { min: 0, max: 1, step: 0.01 },
  specularIntensity: { min: 0, max: 1, step: 0.01 },
  emissiveIntensity: { min: 0, max: 1, step: 0.01 },
  envMapIntensity: { min: 0, max: 1, step: 0.01 },
  sheen: { min: 0, max: 1, step: 0.01 },
  clearcoat: { min: 0, max: 1, step: 0.01 },
  clearcoatRoughness: { min: 0, max: 1, step: 0.01 },
};

export class CharacterFolder {
  private folder: FolderApi;
  constructor(parentFolder: FolderApi, expand: boolean = false) {
    this.folder = parentFolder.addFolder({ title: "characterMaterial", expanded: expand });
    this.folder.addBinding(characterValues, "transmission", characterOptions.transmission);
    this.folder.addBinding(characterValues, "metalness", characterOptions.metalness);
    this.folder.addBinding(characterValues, "roughness", characterOptions.roughness);
    this.folder.addBinding(characterValues, "ior", characterOptions.ior);
    this.folder.addBinding(characterValues, "thickness", characterOptions.thickness);
    this.folder.addBinding(characterValues, "specularColor", {
      color: { type: "float" },
    });
    this.folder.addBinding(
      characterValues,
      "specularIntensity",
      characterOptions.specularIntensity,
    );
    this.folder.addBinding(characterValues, "emissive", {
      color: { type: "float" },
    });
    this.folder.addBinding(
      characterValues,
      "emissiveIntensity",
      characterOptions.emissiveIntensity,
    );
    this.folder.addBinding(characterValues, "envMapIntensity", characterOptions.envMapIntensity);
    this.folder.addBinding(characterValues, "sheenColor", {
      color: { type: "float" },
    });
    this.folder.addBinding(characterValues, "sheen", characterOptions.sheen);
    this.folder.addBinding(characterValues, "clearcoat", characterOptions.clearcoat);
    this.folder.addBinding(
      characterValues,
      "clearcoatRoughness",
      characterOptions.clearcoatRoughness,
    );
  }

  public setupChangeEvent(): void {
    this.folder.on("change", (e: TpChangeEvent<unknown, BladeApi<BladeController<View>>>) => {
      const target = (e.target as any).key;
      if (!target) return;
      switch (target) {
        case "specularColor": {
          const value = e.value as { r: number; g: number; b: number };
          characterValues.specularColor = {
            r: value.r,
            g: value.g,
            b: value.b,
          };
          break;
        }
        case "emissive": {
          const value = e.value as { r: number; g: number; b: number };
          characterValues.emissive = {
            r: value.r,
            g: value.g,
            b: value.b,
          };
          break;
        }
        case "sheenColor": {
          const value = e.value as { r: number; g: number; b: number };
          characterValues.sheenColor = {
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
