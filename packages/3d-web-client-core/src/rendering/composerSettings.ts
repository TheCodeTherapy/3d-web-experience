import { BlendFunction } from "postprocessing";
import { Color } from "three";

export const composerValues = {
  renderer: {
    shadowMap: 2,
    toneMapping: 1,
    exposure: 0.75,
    bgIntensity: 0.6,
    bgBlurriness: 0.0,
  },
  ssao: {
    blendFunction: BlendFunction.MULTIPLY,
    distanceScaling: true,
    depthAwareUpsampling: true,
    samples: 50,
    rings: 11,
    luminanceInfluence: 0.3,
    radius: 0.07,
    intensity: 3.0,
    bias: 0.03,
    fade: 0.03,
    resolutionScale: 1,
    color: new Color(0x000000),
    worldDistanceThreshold: 200,
    worldDistanceFalloff: 2,
    worldProximityThreshold: 100,
    worldProximityFalloff: 2,
  },
  grain: 0.04,
  bloom: 0.7,
};

export const composerOptions = {
  renderer: {
    shadowMap: { min: 0, max: 2, step: 1 },
    toneMapping: { min: 0, max: 5, step: 1 },
    exposure: { min: 0, max: 1, step: 0.01 },
    bgIntensity: { min: 0, max: 1, step: 0.01 },
    bgBlurriness: { min: 0, max: 0.1, step: 0.001 },
  },
  ssao: {
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
  },
  grain: {
    amount: { min: 0, max: 0.2, step: 0.002 },
  },
  bloom: {
    amount: { min: 0, max: 4, step: 0.1 },
  },
};

export const shadowMapTypes: Record<number, string> = {
  0: "BasicShadowMap",
  1: "PCFShadowMap",
  2: "PCFSoftShadowMap",
};

export const rendererToneMappingTypes: Record<number, string> = {
  0: "NoToneMapping",
  1: "LinearToneMapping",
  2: "ReinhardToneMapping",
  3: "CineonToneMapping",
  4: "ACESFilmicToneMapping",
  5: "CustomToneMapping",
};

export const rendererBlades = {
  shadowMapType: shadowMapTypes[composerValues.renderer.shadowMap],
  toneMappingType: rendererToneMappingTypes[composerValues.renderer.toneMapping],
};

export const setShadowMapType = (value: number): void => {
  rendererBlades.shadowMapType = shadowMapTypes[value];
};

export const setToneMappingType = (value: number): void => {
  rendererBlades.toneMappingType = rendererToneMappingTypes[value];
};

export const ssaoMaterialParams = [
  "fade",
  "bias",
  "minRadiusScale",
  "worldDistanceThreshold",
  "worldDistanceFalloff",
  "worldProximityThreshold",
  "worldProximityFalloff",
];

export const statsData = {
  triangles: "0",
  geometries: "0",
  textures: "0",
  shaders: "0",
  postPasses: "0",
  drawCalls: "0",
  FPS: "0",
};
