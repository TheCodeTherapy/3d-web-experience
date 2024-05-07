import { BladeController, View } from "@tweakpane/core";
import { BladeApi, ButtonApi, FolderApi, TpChangeEvent } from "tweakpane";

import { Sun } from "../../sun/Sun";

export const sunValues = {
  sunPosition: {
    sunAzimuthalAngle: 219,
    sunPolarAngle: -37,
  },
  sunIntensity: 3.7,
  sunColor: { r: 1.0, g: 1.0, b: 1.0 },
};

const sunOptions = {
  sunPosition: {
    sunAzimuthalAngle: { min: 0, max: 360, step: 1 },
    sunPolarAngle: { min: -90, max: 90, step: 1 },
  },
  sunIntensity: { min: 0, max: 10, step: 0.1 },
};

export const envValues = {
  ambientLight: {
    ambientLightIntensity: 0.27,
    ambientLightColor: { r: 1, g: 1, b: 1 },
  },
  fog: {
    fogNear: 21,
    fogFar: 180,
    fogColor: { r: 0.7, g: 0.7, b: 0.7 },
  },
};

const envOptions = {
  ambientLight: {
    ambientLightIntensity: { min: 0, max: 1, step: 0.01 },
  },
  fog: {
    fogNear: { min: 0, max: 80, step: 1 },
    fogFar: { min: 81, max: 300, step: 1 },
  },
};

export class EnvironmentFolder {
  public folder: FolderApi;
  private sun: FolderApi;
  private sunButton: ButtonApi;
  private ambient: FolderApi;

  constructor(parentFolder: FolderApi, expand: boolean = false) {
    this.folder = parentFolder.addFolder({ title: "environment", expanded: expand });

    this.sun = this.folder.addFolder({ title: "sun", expanded: true });

    this.ambient = this.folder.addFolder({ title: "ambient", expanded: true });

    this.sun.addBinding(
      sunValues.sunPosition,
      "sunAzimuthalAngle",
      sunOptions.sunPosition.sunAzimuthalAngle,
    );
    this.sun.addBinding(
      sunValues.sunPosition,
      "sunPolarAngle",
      sunOptions.sunPosition.sunPolarAngle,
    );
    this.sun.addBinding(sunValues, "sunIntensity", sunOptions.sunIntensity);
    this.sun.addBinding(sunValues, "sunColor", {
      color: { type: "float" },
    });
    this.sunButton = this.sun.addButton({ title: "Set HDRI" });

    this.ambient.addBinding(
      envValues.ambientLight,
      "ambientLightIntensity",
      envOptions.ambientLight.ambientLightIntensity,
    );
    this.ambient.addBinding(envValues.ambientLight, "ambientLightColor", {
      color: { type: "float" },
    });
    this.ambient.addBinding(envValues.fog, "fogNear", envOptions.fog.fogNear);
    this.ambient.addBinding(envValues.fog, "fogFar", envOptions.fog.fogFar);
    this.ambient.addBinding(envValues.fog, "fogColor", {
      color: { type: "float" },
    });
  }

  public setupChangeEvent(
    setHDR: () => void,
    setAmbientLight: () => void,
    setFog: () => void,
    sun: Sun | null,
  ): void {
    this.sun.on("change", (e: TpChangeEvent<unknown, BladeApi<BladeController<View>>>) => {
      const target = (e.target as any).key;
      if (!target) return;
      switch (target) {
        case "sunAzimuthalAngle": {
          const value = e.value as number;
          sun?.setAzimuthalAngle(value * (Math.PI / 180));
          break;
        }
        case "sunPolarAngle": {
          const value = e.value as number;
          sun?.setPolarAngle(value * (Math.PI / 180));
          break;
        }
        case "sunIntensity": {
          const value = e.value as number;
          sun?.setIntensity(value);
          break;
        }
        case "sunColor": {
          const value = e.value as { r: number; g: number; b: number };
          sunValues.sunColor = {
            r: value.r,
            g: value.g,
            b: value.b,
          };
          sun?.setColor();
          break;
        }
        default:
          break;
      }
    });
    this.sunButton.on("click", () => {
      setHDR();
    });
    this.ambient.on("change", (e: TpChangeEvent<unknown, BladeApi<BladeController<View>>>) => {
      const target = (e.target as any).key;
      if (!target) return;
      switch (target) {
        case "ambientLightIntensity": {
          envValues.ambientLight.ambientLightIntensity = e.value as number;
          setAmbientLight();
          break;
        }
        case "ambientLightColor": {
          const value = e.value as { r: number; g: number; b: number };
          envValues.ambientLight.ambientLightColor = {
            r: value.r,
            g: value.g,
            b: value.b,
          };
          setAmbientLight();
          break;
        }
        case "fogNear": {
          envValues.fog.fogNear = e.value as number;
          setFog();
          break;
        }
        case "fogFar": {
          envValues.fog.fogFar = e.value as number;
          setFog();
          break;
        }
        case "fogColor": {
          const value = e.value as { r: number; g: number; b: number };
          envValues.fog.fogColor = {
            r: value.r,
            g: value.g,
            b: value.b,
          };
          setFog();
          break;
        }
        default:
          break;
      }
    });
  }
}
