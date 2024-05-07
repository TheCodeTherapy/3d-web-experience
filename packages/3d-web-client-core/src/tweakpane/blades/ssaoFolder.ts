import { BindingApi, BladeApi, BladeController, TpChangeEvent, View } from "@tweakpane/core";
import { BlendFunction, EffectComposer, EffectPass, NormalPass, SSAOEffect } from "postprocessing";
import { Color } from "three";
import { FolderApi } from "tweakpane";

export const ppssaoValues = {
  enabled: false,
  blendFunction: BlendFunction.MULTIPLY,
  distanceScaling: true,
  depthAwareUpsampling: true,
  samples: 30,
  rings: 11,
  luminanceInfluence: 0.7,
  radius: 0.045,
  intensity: 3.14,
  bias: 0.01,
  fade: 0.06,
  resolutionScale: 0.5,
  color: { r: 0, g: 0, b: 0 },
  worldDistanceThreshold: 30,
  worldDistanceFalloff: 7,
  worldProximityThreshold: 0.5,
  worldProximityFalloff: 0.3,
};

const ppssaoOptions = {
  samples: { min: 1, max: 50, step: 1 },
  rings: { min: 1, max: 50, step: 1 },
  luminanceInfluence: { min: 0, max: 1, step: 0.01 },
  radius: { min: 0, max: 0.1, step: 0.001 },
  intensity: { min: 0, max: 5, step: 0.1 },
  bias: { min: 0, max: 0.1, step: 0.001 },
  fade: { min: 0, max: 0.1, step: 0.001 },
  resolutionScale: { min: 0.25, max: 2, step: 0.25 },
  worldDistanceThreshold: { min: 0, max: 200, step: 1 },
  worldDistanceFalloff: { min: 0, max: 200, step: 1 },
  worldProximityThreshold: { min: 0, max: 2, step: 0.01 },
  worldProximityFalloff: { min: 0, max: 2, step: 0.01 },
};

export const n8ssaoValues = {
  enabled: true,
  halfRes: true,
  aoRadius: 5,
  distanceFalloff: 3.0,
  intensity: 1.0,
  color: { r: 0, g: 0, b: 0 },
  aoSamples: 16,
  denoiseSamples: 4,
  denoiseRadius: 12,
  viewMode: "Combined",
};

export const n8ssaoOptions = {
  radius: { min: 0.1, max: 6, step: 0.1 },
  distanceFalloff: { min: 1, max: 6, step: 0.1 },
  intensity: { min: 0.1, max: 5, step: 0.1 },
  aoSamples: [2, 4, 8, 16, 32, 64],
  denoiseSamples: [2, 4, 8, 16, 32, 64],
  denoiseRadius: [3, 6, 12],
  viewMode: ["Combined", "AO", "No AO", "Split", "Split AO", "No AO"],
};

const ssaoMaterialParams = [
  "fade",
  "bias",
  "minRadiusScale",
  "worldDistanceThreshold",
  "worldDistanceFalloff",
  "worldProximityThreshold",
  "worldProximityFalloff",
];

export class SSAOFolder {
  private folder: FolderApi;

  private ppssao: FolderApi;
  private n8ssao: FolderApi;

  private aoSamples: BindingApi;
  private denoiseSamples: BindingApi;
  private denoiseRadius: BindingApi;
  private aoDisplay: BindingApi;

  private postProcessingSSAOIndex: number = 1;

  constructor(parentFolder: FolderApi, expand: boolean = false) {
    this.folder = parentFolder.addFolder({ title: "ambientOcclusion", expanded: expand });
    this.n8ssao = this.folder.addFolder({
      title: "N8 ambientOcclusion",
      expanded: n8ssaoValues.enabled,
    });
    this.ppssao = this.folder.addFolder({
      title: "PP ambientOcclusion",
      expanded: ppssaoValues.enabled,
    });

    // Post-processing SSAO
    {
      this.ppssao.addBinding({ enabled: ppssaoValues.enabled }, "enabled");
      this.ppssao.addBinding({ showEffectOnly: false }, "showEffectOnly");
      this.ppssao.addBinding(ppssaoValues, "samples", ppssaoOptions.samples);
      this.ppssao.addBinding(ppssaoValues, "rings", ppssaoOptions.rings);
      this.ppssao.addBinding(ppssaoValues, "luminanceInfluence", ppssaoOptions.luminanceInfluence);
      this.ppssao.addBinding(ppssaoValues, "radius", ppssaoOptions.radius);
      this.ppssao.addBinding(ppssaoValues, "intensity", ppssaoOptions.intensity);
      this.ppssao.addBinding(ppssaoValues, "bias", ppssaoOptions.bias);
      this.ppssao.addBinding(ppssaoValues, "fade", ppssaoOptions.fade);
      this.ppssao.addBinding(ppssaoValues, "resolutionScale", ppssaoOptions.resolutionScale);
      this.ppssao.addBinding(
        ppssaoValues,
        "worldDistanceThreshold",
        ppssaoOptions.worldDistanceThreshold,
      );
      this.ppssao.addBinding(
        ppssaoValues,
        "worldDistanceFalloff",
        ppssaoOptions.worldDistanceFalloff,
      );
      this.ppssao.addBinding(
        ppssaoValues,
        "worldProximityThreshold",
        ppssaoOptions.worldProximityThreshold,
      );
      this.ppssao.addBinding(
        ppssaoValues,
        "worldProximityFalloff",
        ppssaoOptions.worldProximityFalloff,
      );
      this.ppssao.addBinding(ppssaoValues, "color", { color: { alpha: false, type: "float" } });
    }

    // N8 SSAO
    {
      this.n8ssao.addBinding({ enabled: n8ssaoValues.enabled }, "enabled");
      this.n8ssao.addBinding({ halfRes: n8ssaoValues.halfRes }, "halfRes");
      this.n8ssao.addBinding(n8ssaoValues, "aoRadius", n8ssaoOptions.radius);
      this.n8ssao.addBinding(n8ssaoValues, "distanceFalloff", n8ssaoOptions.distanceFalloff);
      this.n8ssao.addBinding(n8ssaoValues, "intensity", n8ssaoOptions.intensity);
      this.n8ssao.addBinding(n8ssaoValues, "color", { color: { alpha: false, type: "float" } });

      this.aoSamples = this.n8ssao.addBinding(n8ssaoValues, "aoSamples", {
        view: "radiogrid",
        groupName: "aoSamples",
        size: [3, 2],
        cells: (x: number, y: number) => ({
          title: `${n8ssaoOptions.aoSamples[y * 3 + x]}`,
          value: n8ssaoOptions.aoSamples[y * 3 + x],
        }),
        label: "aoSamples",
      });

      this.denoiseSamples = this.n8ssao.addBinding(n8ssaoValues, "denoiseSamples", {
        view: "radiogrid",
        groupName: "denoiseSamples",
        size: [3, 2],
        cells: (x: number, y: number) => ({
          title: `${n8ssaoOptions.denoiseSamples[y * 3 + x]}`,
          value: n8ssaoOptions.denoiseSamples[y * 3 + x],
        }),
        label: "denoiseSamples",
      });

      this.denoiseRadius = this.n8ssao.addBinding(n8ssaoValues, "denoiseRadius", {
        view: "radiogrid",
        groupName: "denoiseRadius",
        size: [3, 1],
        cells: (x: number, y: number) => ({
          title: `${n8ssaoOptions.denoiseRadius[y * 3 + x]}`,
          value: n8ssaoOptions.denoiseRadius[y * 3 + x],
        }),
        label: "denoiseRadius",
      });

      this.aoDisplay = this.n8ssao.addBinding(n8ssaoValues, "viewMode", {
        view: "radiogrid",
        groupName: "viewMode",
        size: [3, 2],
        cells: (x: number, y: number) => ({
          title: `${n8ssaoOptions.viewMode[y * 3 + x]}`,
          value: `${n8ssaoOptions.viewMode[y * 3 + x]}`,
        }),
        label: "viewMode",
      });
    }

    this.folder.addBlade({ view: "separator" });
  }

  public setupChangeEvent(
    composer: EffectComposer,
    normalPass: NormalPass,
    ppssaoEffect: SSAOEffect,
    ppssaoPass: EffectPass,
    n8aopass: any,
  ): void {
    this.ppssao.on("change", (e: TpChangeEvent<unknown, BladeApi<BladeController<View>>>) => {
      const target = (e.target as any).key;
      if (!target) return;
      switch (target) {
        case "enabled": {
          const value = e.value as boolean;
          if (e.value === true) {
            composer.addPass(normalPass, this.postProcessingSSAOIndex);
            composer.addPass(ppssaoPass, this.postProcessingSSAOIndex + 1);
          } else {
            composer.removePass(ppssaoPass);
            composer.removePass(normalPass);
          }
          ppssaoValues.enabled = value;
          normalPass.enabled = value;
          ppssaoPass.enabled = value;
          break;
        }
        case "showEffectOnly": {
          const value = e.value as boolean;
          const blend = value === true ? BlendFunction.NORMAL : BlendFunction.MULTIPLY;
          ppssaoEffect.blendMode.blendFunction = blend;
          break;
        }
        case "resolutionScale": {
          const value = e.value as number;
          ppssaoEffect.resolution.scale = value;
          break;
        }
        case "color": {
          const value = e.value as { r: number; g: number; b: number };
          ppssaoEffect.color = new Color().setRGB(value.r, value.g, value.b);
          break;
        }
        default: {
          break;
        }
      }

      if (ssaoMaterialParams.includes(target)) {
        (ppssaoEffect.ssaoMaterial as any)[target] = e.value;
        return;
      }
      (ppssaoEffect as any)[target] = e.value;
    });

    this.n8ssao.on("change", (e: TpChangeEvent<unknown, BladeApi<BladeController<View>>>) => {
      const target = (e.target as any).key;
      if (!target) return;
      switch (target) {
        case "enabled":
          if (e.value === true) {
            composer.addPass(n8aopass, this.postProcessingSSAOIndex + 2);
            composer.passes[this.postProcessingSSAOIndex + 2].setSize(
              window.innerWidth,
              window.innerHeight,
            );
          } else {
            composer.removePass(n8aopass);
          }
          n8aopass.enabled = e.value;
          break;
        case "halfRes":
          n8aopass.configuration.halfRes = e.value;
          break;
        case "aoRadius":
          n8aopass.configuration.aoRadius = e.value;
          break;
        case "distanceFalloff":
          n8aopass.configuration.distanceFalloff = e.value;
          break;
        case "intensity":
          n8aopass.configuration.intensity = e.value;
          break;
        case "color":
          const value = (e as any).value;
          n8aopass.configuration.color = new Color().setRGB(value.r, value.g, value.b);
          break;
        default:
          break;
      }
    });

    this.aoSamples.on("change", (e: any) => {
      n8aopass.configuration.aoSamples = e.value;
    });

    this.denoiseSamples.on("change", (e: any) => {
      n8aopass.configuration.denoiseSamples = e.value;
    });

    this.denoiseRadius.on("change", (e: any) => {
      n8aopass.configuration.denoiseRadius = e.value;
    });

    this.aoDisplay.on("change", (e: any) => {
      n8aopass.setDisplayMode(e.value);
    });
  }
}
