import { BladeController, View } from "@tweakpane/core";
import { EffectPass } from "postprocessing";
import { ShadowMapType, ToneMapping, WebGLRenderer } from "three";
import { BladeApi, FolderApi, TpChangeEvent } from "tweakpane";

export const rendererValues = {
  shadowMap: 2,
  toneMapping: 5,
  exposure: 2.1,
};

const rendererOptions = {
  shadowMap: { min: 0, max: 2, step: 1 },
  toneMapping: { min: 0, max: 5, step: 1 },
  exposure: { min: 0, max: 3, step: 0.01 },
};

const shadowMapTypes: Record<number, string> = {
  0: "BasicShadowMap",
  1: "PCFShadowMap",
  2: "PCFSoftShadowMap",
};

const toneMappingTypes: Record<number, string> = {
  0: "NoToneMapping",
  1: "LinearToneMapping",
  2: "ReinhardToneMapping",
  3: "CineonToneMapping",
  4: "ACESFilmicToneMapping",
  5: "CustomToneMapping",
};

const monitoredValues = {
  shadowMapType: shadowMapTypes[rendererValues.shadowMap],
  toneMappingType: toneMappingTypes[rendererValues.toneMapping],
};

const setShadowMapType = (value: number): void => {
  monitoredValues.shadowMapType = shadowMapTypes[value];
};

const setToneMappingType = (value: number): void => {
  monitoredValues.toneMappingType = toneMappingTypes[value];
  rendererValues.toneMapping = value;
  console.log(rendererValues.toneMapping);
};

export class RendererFolder {
  private folder: FolderApi;

  constructor(parentFolder: FolderApi, expand: boolean = false) {
    this.folder = parentFolder.addFolder({
      title: "rendererOptions",
      expanded: expand,
    });

    this.folder.addBinding(rendererValues, "shadowMap", rendererOptions.shadowMap);
    this.folder.addBinding(monitoredValues, "shadowMapType", { readonly: true });
    this.folder.addBinding(rendererValues, "toneMapping", rendererOptions.toneMapping);
    this.folder.addBinding(monitoredValues, "toneMappingType", { readonly: true });
    this.folder.addBinding(rendererValues, "exposure", rendererOptions.exposure);
  }

  public setupChangeEvent(
    renderer: WebGLRenderer,
    toneMappingFolder: FolderApi,
    toneMappingPass: EffectPass | any,
  ): void {
    this.folder.on("change", (e: TpChangeEvent<unknown, BladeApi<BladeController<View>>>) => {
      const target = (e.target as any).key;
      if (!target) return;
      switch (target) {
        case "shadowMap": {
          const value = e.value as ShadowMapType;
          renderer.shadowMap.type = value;
          setShadowMapType(value);
          break;
        }
        case "toneMapping":
          const value = e.value as ToneMapping;
          toneMappingFolder.hidden = e.value !== 5;
          toneMappingPass.enabled = e.value === 5 ? true : false;
          setToneMappingType(e.value as ToneMapping);
          break;
        case "exposure":
          renderer.toneMappingExposure = e.value as number;
          break;
        default:
          break;
      }
    });
  }
}
