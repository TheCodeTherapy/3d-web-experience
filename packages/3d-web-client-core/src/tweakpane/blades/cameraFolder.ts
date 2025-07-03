import { BladeController, View } from "@tweakpane/core";
import { BladeApi, FolderApi, TpChangeEvent } from "tweakpane";

import { CameraManager } from "../../camera/CameraManager";

export const camValues = {
  initialDistance: 3.3,
  minDistance: 0.1,
  maxDistance: 7,
  initialFOV: 60,
  maxFOV: 70,
  minFOV: 60,
  invertFOVMapping: false,
  damping: 0.21,
  zoomScale: 0.04,
  zoomDamping: 0.04,
};

export const camOptions = {
  initialDistance: { min: 1, max: 5, step: 0.1 },
  minDistance: { min: 0.1, max: 2, step: 0.1 },
  maxDistance: { min: 5, max: 20, step: 0.5 },
  initialFOV: { min: 60, max: 85, step: 1 },
  maxFOV: { min: 50, max: 100, step: 1 },
  minFOV: { min: 50, max: 100, step: 1 },
  damping: { min: 0.01, max: 1, step: 0.001 },
  zoomScale: { min: 0.005, max: 0.3, step: 0.001 },
  zoomDamping: { min: 0.0, max: 2.0, step: 0.01 },
};

type CamData = {
  distance: string;
  FoV: string;
};

export class CameraFolder {
  public folder: FolderApi;

  private camData: CamData = {
    distance: "0",
    FoV: "0",
  };

  constructor(parentFolder: FolderApi, expand: boolean = false) {
    this.folder = parentFolder.addFolder({ title: "camera", expanded: expand });
    this.folder.addBinding(this.camData, "distance", { readonly: true });
    this.folder.addBinding(this.camData, "FoV", { readonly: true });
    this.folder.addBinding(camValues, "initialDistance", camOptions.initialDistance);
    this.folder.addBinding(camValues, "minDistance", camOptions.minDistance);
    this.folder.addBinding(camValues, "maxDistance", camOptions.maxDistance);
    this.folder.addBinding(camValues, "minFOV", camOptions.minFOV);
    this.folder.addBinding(camValues, "maxFOV", camOptions.maxFOV);
    this.folder.addBinding({ invertFOVMapping: camValues.invertFOVMapping }, "invertFOVMapping");
    this.folder.addBinding(camValues, "damping", camOptions.damping);
    this.folder.addBinding(camValues, "zoomScale", camOptions.zoomScale);
    this.folder.addBinding(camValues, "zoomDamping", camOptions.zoomDamping);
  }

  public setupChangeEvent(cameraManager: CameraManager): void {
    this.folder.on("change", (e: TpChangeEvent<unknown, BladeApi<BladeController<View>>>) => {
      const target = (e.target as any).key;
      if (!target) return;
      switch (target) {
        case "initialDistance": {
          const value = e.value as number;
          cameraManager.initialDistance = value;
          cameraManager.distance = value;
          cameraManager.targetDistance = value;
          cameraManager.desiredDistance = value;
          cameraManager.recomputeFoV();
          break;
        }
        case "minDistance": {
          const value = e.value as number;
          cameraManager.minDistance = value;
          cameraManager.distance = value;
          cameraManager.targetDistance = value;
          cameraManager.desiredDistance = value;
          cameraManager.recomputeFoV();
          break;
        }
        case "maxDistance": {
          const value = e.value as number;
          cameraManager.maxDistance = value;
          cameraManager.distance = value;
          cameraManager.targetDistance = value;
          cameraManager.desiredDistance = value;
          cameraManager.recomputeFoV();
          break;
        }
        case "minFOV": {
          const value = e.value as number;
          cameraManager.minFOV = value;
          cameraManager.recomputeFoV();
          break;
        }
        case "maxFOV": {
          const value = e.value as number;
          cameraManager.maxFOV = value;
          cameraManager.recomputeFoV();
          break;
        }
        case "invertFOVMapping": {
          const boolValue = e.value as boolean;
          cameraManager.invertFOVMapping = boolValue;
          break;
        }
        case "damping": {
          const value = e.value as number;
          cameraManager.damping = value;
          break;
        }
        case "zoomScale": {
          const value = e.value as number;
          cameraManager.zoomScale = value;
          break;
        }
        case "zoomDamping": {
          const value = e.value as number;
          cameraManager.zoomDamping = value;
          break;
        }
        default:
          break;
      }
    });
  }

  public update(cameraManager: CameraManager): void {
    this.camData.distance = cameraManager.distance.toFixed(2);
    this.camData.FoV = cameraManager.fov.toFixed(2);
  }
}
