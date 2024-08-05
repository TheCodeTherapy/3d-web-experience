import { HDRJPGLoader } from "@monogrid/gainmap-js";
import {
  BlendFunction,
  BloomEffect,
  EdgeDetectionMode,
  EffectComposer,
  EffectPass,
  FXAAEffect,
  NormalPass,
  PredicationMode,
  RenderPass,
  ShaderPass,
  SMAAEffect,
  SMAAPreset,
  SSAOEffect,
  TextureEffect,
  ToneMappingEffect,
} from "postprocessing";
import {
  AmbientLight,
  Color,
  EquirectangularReflectionMapping,
  Euler,
  Fog,
  HalfFloatType,
  LinearSRGBColorSpace,
  LoadingManager,
  MathUtils,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  ShadowMapType,
  SRGBColorSpace,
  Texture,
  ToneMapping,
  Vector2,
  WebGLRenderer,
} from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

import { Sun } from "../sun/Sun";
import { TimeManager } from "../time/TimeManager";
import { bcsValues } from "../tweakpane/blades/bcsFolder";
import { envValues, sunValues } from "../tweakpane/blades/environmentFolder";
import { extrasValues } from "../tweakpane/blades/postExtrasFolder";
import { rendererValues } from "../tweakpane/blades/rendererFolder";
import { n8ssaoValues, ppssaoValues } from "../tweakpane/blades/ssaoFolder";
import { toneMappingValues } from "../tweakpane/blades/toneMappingFolder";
import { TweakPane } from "../tweakpane/TweakPane";

import { BrightnessContrastSaturation } from "./post-effects/bright-contrast-sat";
import { GaussGrainEffect } from "./post-effects/gauss-grain";
import { N8SSAOPass } from "./post-effects/n8-ssao/N8SSAOPass";

type ComposerContructorArgs = {
  scene: Scene;
  camera: PerspectiveCamera;
  spawnSun: boolean;
  environmentConfiguration?: EnvironmentConfiguration;
};

export type EnvironmentConfiguration = {
  groundPlane?: boolean;
  groundPlaneType?: "neutral" | "grass" | undefined;
  skybox?: {
    intensity?: number;
    blurriness?: number;
    azimuthalAngle?: number;
    polarAngle?: number;
  } & (
    | {
        hdrJpgUrl: string;
      }
    | {
        hdrUrl: string;
      }
  );
  envMap?: {
    intensity?: number;
  };
  sun?: {
    intensity?: number;
    polarAngle?: number;
    azimuthalAngle?: number;
  };
  postProcessing?: {
    bloomIntensity?: number;
  };
  ambientLight?: {
    intensity?: number;
  };
};

export class Composer {
  private width: number = 1;
  private height: number = 1;
  private resizeListener: () => void;
  public resolution: Vector2 = new Vector2(this.width, this.height);

  private readonly scene: Scene;
  public postPostScene: Scene;
  private readonly camera: PerspectiveCamera;
  public readonly renderer: WebGLRenderer;

  public readonly effectComposer: EffectComposer;
  private readonly renderPass: RenderPass;

  private readonly normalPass: NormalPass;
  private readonly normalTextureEffect: TextureEffect;
  private readonly ppssaoEffect: SSAOEffect;
  private readonly ppssaoPass: EffectPass;
  private readonly n8aopass: N8SSAOPass;

  private readonly fxaaEffect: FXAAEffect;
  private readonly fxaaPass: EffectPass;
  private readonly bloomEffect: BloomEffect;
  private readonly bloomPass: EffectPass;
  private readonly toneMappingEffect: ToneMappingEffect;
  private readonly smaaEffect: SMAAEffect;

  private readonly toneMappingPass: EffectPass;
  private readonly smaaPass: EffectPass;

  private readonly bcs = BrightnessContrastSaturation;
  private readonly bcsPass: ShaderPass;

  private readonly gaussGrainEffect = GaussGrainEffect;
  private readonly gaussGrainPass: ShaderPass;

  private ambientLight: AmbientLight | null = null;
  private environmentConfiguration?: EnvironmentConfiguration;

  private skyboxState: {
    src: {
      hdrJpgUrl?: string;
      hdrUrl?: string;
    };
    latestPromise: Promise<unknown> | null;
  } = { src: {}, latestPromise: null };

  public sun: Sun | null = null;
  public spawnSun: boolean;

  constructor({
    scene,
    camera,
    spawnSun = false,
    environmentConfiguration,
  }: ComposerContructorArgs) {
    this.scene = scene;
    this.postPostScene = new Scene();
    this.camera = camera;
    this.spawnSun = spawnSun;
    this.renderer = new WebGLRenderer({
      powerPreference: "high-performance",
      antialias: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.info.autoReset = false;
    this.renderer.setSize(this.width, this.height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = rendererValues.shadowMap as ShadowMapType;
    this.renderer.toneMapping = rendererValues.toneMapping as ToneMapping;
    this.renderer.toneMappingExposure = rendererValues.exposure;

    this.environmentConfiguration = environmentConfiguration;

    this.updateSkyboxAndEnvValues();
    this.updateAmbientLightValues();
    this.setFog();

    this.effectComposer = new EffectComposer(this.renderer, {
      frameBufferType: HalfFloatType,
    });

    this.renderPass = new RenderPass(this.scene, this.camera);

    this.normalPass = new NormalPass(this.scene, this.camera);
    this.normalPass.enabled = ppssaoValues.enabled;
    this.normalTextureEffect = new TextureEffect({
      blendFunction: BlendFunction.SKIP,
      texture: this.normalPass.texture,
    });

    this.ppssaoEffect = new SSAOEffect(this.camera, this.normalPass.texture, {
      blendFunction: ppssaoValues.blendFunction,
      distanceScaling: ppssaoValues.distanceScaling,
      depthAwareUpsampling: ppssaoValues.depthAwareUpsampling,
      samples: ppssaoValues.samples,
      rings: ppssaoValues.rings,
      luminanceInfluence: ppssaoValues.luminanceInfluence,
      radius: ppssaoValues.radius,
      intensity: ppssaoValues.intensity,
      bias: ppssaoValues.bias,
      fade: ppssaoValues.fade,
      resolutionScale: ppssaoValues.resolutionScale,
      color: new Color().setRGB(ppssaoValues.color.r, ppssaoValues.color.g, ppssaoValues.color.b),
      worldDistanceThreshold: ppssaoValues.worldDistanceThreshold,
      worldDistanceFalloff: ppssaoValues.worldDistanceFalloff,
      worldProximityThreshold: ppssaoValues.worldProximityThreshold,
      worldProximityFalloff: ppssaoValues.worldProximityFalloff,
    });
    this.ppssaoPass = new EffectPass(this.camera, this.ppssaoEffect, this.normalTextureEffect);
    this.ppssaoPass.enabled = ppssaoValues.enabled;

    this.fxaaEffect = new FXAAEffect();

    if (environmentConfiguration?.postProcessing?.bloomIntensity) {
      extrasValues.bloom = environmentConfiguration.postProcessing.bloomIntensity;
    }

    this.bloomEffect = new BloomEffect({
      intensity: extrasValues.bloom,
    });

    this.n8aopass = new N8SSAOPass(this.scene, this.camera, this.width, this.height);
    this.n8aopass.configuration.aoRadius = n8ssaoValues.aoRadius;
    this.n8aopass.configuration.distanceFalloff = n8ssaoValues.distanceFalloff;
    this.n8aopass.configuration.intensity = n8ssaoValues.intensity;
    this.n8aopass.configuration.color = new Color().setRGB(
      n8ssaoValues.color.r,
      n8ssaoValues.color.g,
      n8ssaoValues.color.b,
    );
    this.n8aopass.configuration.aoSamples = n8ssaoValues.aoSamples;
    this.n8aopass.configuration.denoiseSamples = n8ssaoValues.denoiseSamples;
    this.n8aopass.configuration.denoiseRadius = n8ssaoValues.denoiseRadius;
    this.n8aopass.enabled = n8ssaoValues.enabled;

    this.fxaaPass = new EffectPass(this.camera, this.fxaaEffect);
    this.bloomPass = new EffectPass(this.camera, this.bloomEffect);

    this.toneMappingEffect = new ToneMappingEffect({
      mode: toneMappingValues.mode,
      resolution: toneMappingValues.resolution,
      whitePoint: toneMappingValues.whitePoint,
      middleGrey: toneMappingValues.middleGrey,
      minLuminance: toneMappingValues.minLuminance,
      averageLuminance: toneMappingValues.averageLuminance,
      adaptationRate: toneMappingValues.adaptationRate,
    });
    this.smaaEffect = new SMAAEffect({
      preset: SMAAPreset.ULTRA,
      edgeDetectionMode: EdgeDetectionMode.COLOR,
      predicationMode: PredicationMode.DEPTH,
    });

    this.toneMappingPass = new EffectPass(this.camera, this.toneMappingEffect);
    this.toneMappingPass.enabled =
      rendererValues.toneMapping === 5 || rendererValues.toneMapping === 0 ? true : false;

    this.bcsPass = new ShaderPass(this.bcs, "tDiffuse");
    this.bcs.uniforms.brightness.value = bcsValues.brightness;
    this.bcs.uniforms.contrast.value = bcsValues.contrast;
    this.bcs.uniforms.saturation.value = bcsValues.saturation;

    this.gaussGrainPass = new ShaderPass(this.gaussGrainEffect, "tDiffuse");
    this.gaussGrainEffect.uniforms.amount.value = extrasValues.grain;
    this.gaussGrainEffect.uniforms.alpha.value = 1.0;

    this.smaaPass = new EffectPass(this.camera, this.smaaEffect);

    this.effectComposer.addPass(this.renderPass);
    if (ppssaoValues.enabled) {
      this.effectComposer.addPass(this.normalPass);
      this.effectComposer.addPass(this.ppssaoPass);
    }
    if (n8ssaoValues.enabled) {
      this.effectComposer.addPass(this.n8aopass);
    }
    this.effectComposer.addPass(this.fxaaPass);
    this.effectComposer.addPass(this.smaaPass);
    this.effectComposer.addPass(this.bloomPass);
    this.effectComposer.addPass(this.toneMappingPass);
    this.effectComposer.addPass(this.bcsPass);
    this.effectComposer.addPass(this.gaussGrainPass);

    if (this.spawnSun === true) {
      this.sun = new Sun();
      this.scene.add(this.sun);
    }

    if (this.environmentConfiguration?.skybox) {
      if ("hdrJpgUrl" in this.environmentConfiguration.skybox) {
        this.useHDRJPG(this.environmentConfiguration.skybox.hdrJpgUrl);
      } else if ("hdrUrl" in this.environmentConfiguration.skybox) {
        this.useHDRI(this.environmentConfiguration.skybox.hdrUrl);
      }
    }

    this.updateSunValues();

    this.resizeListener = () => {
      this.fitContainer();
    };
    window.addEventListener("resize", this.resizeListener, false);
    this.fitContainer();
  }

  public updateEnvironmentConfiguration(environmentConfiguration: EnvironmentConfiguration) {
    this.environmentConfiguration = environmentConfiguration;

    if (environmentConfiguration.skybox) {
      if ("hdrJpgUrl" in environmentConfiguration.skybox) {
        this.useHDRJPG(environmentConfiguration.skybox.hdrJpgUrl);
      } else if ("hdrUrl" in environmentConfiguration.skybox) {
        this.useHDRI(environmentConfiguration.skybox.hdrUrl);
      }
    }

    this.updateSkyboxAndEnvValues();
    this.updateAmbientLightValues();
    this.updateSunValues();
  }

  public setupTweakPane(tweakPane: TweakPane) {
    tweakPane.setupRenderPane(
      this.effectComposer,
      this.normalPass,
      this.ppssaoEffect,
      this.ppssaoPass,
      this.n8aopass,
      this.toneMappingEffect,
      this.toneMappingPass,
      this.bcs,
      this.bloomEffect,
      this.gaussGrainEffect,
      this.spawnSun,
      this.sun,
      this.setHDRIFromFile.bind(this),
      (azimuthalAngle: number) => {
        envValues.skyboxAzimuthalAngle = azimuthalAngle;
        this.updateSkyboxRotation();
      },
      (polarAngle: number) => {
        envValues.skyboxPolarAngle = polarAngle;
        this.updateSkyboxRotation();
      },
      this.setAmbientLight.bind(this),
      this.setFog.bind(this),
    );
  }

  public dispose() {
    window.removeEventListener("resize", this.resizeListener);
    this.renderer.dispose();
  }

  public fitContainer() {
    if (!this) {
      console.error("Composer not initialized");
      return;
    }
    const parentElement = this.renderer.domElement.parentNode as HTMLElement;
    if (!parentElement) {
      return;
    }
    this.width = parentElement.clientWidth;
    this.height = parentElement.clientHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.resolution.set(
      this.width * window.devicePixelRatio,
      this.height * window.devicePixelRatio,
    );
    this.effectComposer.setSize(
      this.width / window.devicePixelRatio,
      this.height / window.devicePixelRatio,
    );
    this.renderPass.setSize(this.width, this.height);
    if (ppssaoValues.enabled) {
      this.normalPass.setSize(this.width, this.height);
      this.normalTextureEffect.setSize(this.width, this.height);
      this.ppssaoPass.setSize(this.width, this.height);
    }
    if (n8ssaoValues.enabled) {
      this.n8aopass.setSize(this.width, this.height);
    }
    this.fxaaPass.setSize(this.width, this.height);
    this.smaaPass.setSize(this.width, this.height);
    this.bloomPass.setSize(this.width, this.height);
    this.toneMappingPass.setSize(this.width, this.height);
    this.gaussGrainPass.setSize(this.width, this.height);
    this.gaussGrainEffect.uniforms.resolution.value = new Vector2(this.width, this.height);
    this.renderer.setSize(this.width, this.height);
  }

  public render(timeManager: TimeManager): void {
    this.renderer.info.reset();
    this.normalPass.texture.needsUpdate = true;
    this.gaussGrainEffect.uniforms.time.value = timeManager.time;
    this.effectComposer.render();
    this.renderer.clearDepth();
    this.renderer.render(this.postPostScene, this.camera);
  }

  public updateSkyboxRotation() {
    this.scene.backgroundRotation = new Euler(
      MathUtils.degToRad(envValues.skyboxPolarAngle),
      MathUtils.degToRad(envValues.skyboxAzimuthalAngle),
      0,
    );
    this.scene.environmentRotation = new Euler(
      MathUtils.degToRad(envValues.skyboxPolarAngle),
      MathUtils.degToRad(envValues.skyboxAzimuthalAngle),
      0,
    );
  }

  private async loadHDRJPG(url: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      const pmremGenerator = new PMREMGenerator(this.renderer);
      const hdrJpg = new HDRJPGLoader(this.renderer).load(url, () => {
        const hdrJpgEquirectangularMap = hdrJpg.renderTarget.texture;
        hdrJpgEquirectangularMap.mapping = EquirectangularReflectionMapping;
        hdrJpgEquirectangularMap.needsUpdate = true;

        const envMap = pmremGenerator!.fromEquirectangular(hdrJpgEquirectangularMap).texture;
        hdrJpgEquirectangularMap.dispose();
        pmremGenerator!.dispose();
        hdrJpg.dispose();
        if (envMap) {
          envMap.colorSpace = LinearSRGBColorSpace;
          envMap.needsUpdate = true;
          resolve(envMap);
        } else {
          reject("Failed to generate environment map");
        }
      });
    });
  }

  private async loadHDRi(url: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      const pmremGenerator = new PMREMGenerator(this.renderer);
      new RGBELoader(new LoadingManager()).load(url, (texture) => {
        const envMap = pmremGenerator!.fromEquirectangular(texture).texture;
        texture.dispose();
        pmremGenerator!.dispose();
        if (envMap) {
          envMap.colorSpace = LinearSRGBColorSpace;
          envMap.needsUpdate = true;
          resolve(envMap);
        } else {
          reject("Failed to generate environment map");
        }
      });
    });
  }

  public useHDRJPG(url: string, fromFile: boolean = false): void {
    if (this.skyboxState.src.hdrJpgUrl === url) {
      return;
    }

    const hdrJPGPromise = this.loadHDRJPG(url);
    this.skyboxState.src = { hdrJpgUrl: url };
    this.skyboxState.latestPromise = hdrJPGPromise;
    hdrJPGPromise.then((envMap) => {
      if (this.skyboxState.latestPromise !== hdrJPGPromise) {
        return;
      }
      this.applyEnvMap(envMap);
    });
  }

  public useHDRI(url: string): void {
    if (this.skyboxState.src.hdrUrl === url) {
      return;
    }
    const hdrPromise = this.loadHDRi(url);
    this.skyboxState.src = { hdrUrl: url };
    this.skyboxState.latestPromise = hdrPromise;
    hdrPromise.then((envMap) => {
      if (this.skyboxState.latestPromise !== hdrPromise) {
        return;
      }
      this.applyEnvMap(envMap);
    });
  }

  public setHDRIFromFile(): void {
    if (!this.renderer) return;
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".hdr,.jpg";
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) {
        console.log("no file");
        return;
      }
      const extension = file.name.split(".").pop();
      const fileURL = URL.createObjectURL(file);
      if (fileURL) {
        if (extension === "hdr") {
          this.useHDRI(fileURL);
        } else if (extension === "jpg") {
          this.useHDRJPG(fileURL);
        } else {
          console.error(`Unrecognized extension for HDR file ${file.name}`);
        }
        URL.revokeObjectURL(fileURL);
        document.body.removeChild(fileInput);
      }
    });
    document.body.appendChild(fileInput);
    fileInput.click();
  }

  public setFog(): void {
    const fogColor = new Color().setRGB(
      envValues.fog.fogColor.r,
      envValues.fog.fogColor.g,
      envValues.fog.fogColor.b,
    );
    this.scene.fog = new Fog(fogColor, envValues.fog.fogNear, envValues.fog.fogFar);
  }

  public setAmbientLight(): void {
    if (this.ambientLight) {
      this.scene.remove(this.ambientLight);
      this.ambientLight.dispose();
    }
    const ambientLightColor = new Color().setRGB(
      envValues.ambientLight.ambientLightColor.r,
      envValues.ambientLight.ambientLightColor.g,
      envValues.ambientLight.ambientLightColor.b,
    );
    this.ambientLight = new AmbientLight(
      ambientLightColor,
      envValues.ambientLight.ambientLightIntensity,
    );
    this.scene.add(this.ambientLight);
  }

  private updateSunValues() {
    if (typeof this.environmentConfiguration?.sun?.intensity === "number") {
      sunValues.sunIntensity = this.environmentConfiguration.sun.intensity;
      this.sun?.setIntensity(this.environmentConfiguration.sun.intensity);
    }
    if (typeof this.environmentConfiguration?.sun?.azimuthalAngle === "number") {
      sunValues.sunPosition.sunAzimuthalAngle = this.environmentConfiguration.sun.azimuthalAngle;
      this.sun?.setAzimuthalAngle(this.environmentConfiguration.sun.azimuthalAngle);
    }
    if (typeof this.environmentConfiguration?.sun?.polarAngle === "number") {
      sunValues.sunPosition.sunPolarAngle = this.environmentConfiguration.sun.polarAngle;
      this.sun?.setPolarAngle(this.environmentConfiguration.sun.polarAngle);
    }
  }

  private updateSkyboxAndEnvValues() {
    if (typeof this.environmentConfiguration?.envMap?.intensity === "number") {
      envValues.envMapIntensity = this.environmentConfiguration?.envMap.intensity;
    }
    this.scene.environmentIntensity = envValues.envMapIntensity;

    if (typeof this.environmentConfiguration?.skybox?.intensity === "number") {
      envValues.skyboxIntensity = this.environmentConfiguration?.skybox.intensity;
    }
    this.scene.backgroundIntensity = envValues.skyboxIntensity;

    if (typeof this.environmentConfiguration?.skybox?.blurriness === "number") {
      envValues.skyboxBlurriness = this.environmentConfiguration?.skybox.blurriness;
    }
    this.scene.backgroundBlurriness = envValues.skyboxBlurriness;

    if (typeof this.environmentConfiguration?.skybox?.azimuthalAngle === "number") {
      envValues.skyboxAzimuthalAngle = this.environmentConfiguration?.skybox.azimuthalAngle;
      this.updateSkyboxRotation();
    }

    if (typeof this.environmentConfiguration?.skybox?.polarAngle === "number") {
      envValues.skyboxPolarAngle = this.environmentConfiguration?.skybox.polarAngle;
      this.updateSkyboxRotation();
    }
  }

  private updateAmbientLightValues() {
    if (typeof this.environmentConfiguration?.ambientLight?.intensity === "number") {
      envValues.ambientLight.ambientLightIntensity =
        this.environmentConfiguration.ambientLight.intensity;
    }
    this.setAmbientLight();
  }

  private applyEnvMap(envMap: Texture) {
    this.scene.environment = envMap;
    this.scene.environmentIntensity = envValues.envMapIntensity;
    this.scene.environmentRotation = new Euler(
      MathUtils.degToRad(envValues.skyboxPolarAngle),
      MathUtils.degToRad(envValues.skyboxAzimuthalAngle),
      0,
    );
    this.scene.background = envMap;
    this.scene.backgroundIntensity = envValues.skyboxIntensity;
    this.scene.backgroundBlurriness = envValues.skyboxBlurriness;
    this.scene.backgroundRotation = new Euler(
      MathUtils.degToRad(envValues.skyboxPolarAngle),
      MathUtils.degToRad(envValues.skyboxAzimuthalAngle),
      0,
    );
  }
}
