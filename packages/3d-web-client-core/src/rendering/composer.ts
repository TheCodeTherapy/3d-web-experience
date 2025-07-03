import { HDRJPGLoader } from "@monogrid/gainmap-js";
import {
  AmbientLight,
  Color,
  CubeCamera,
  EquirectangularReflectionMapping,
  Euler,
  Fog,
  LinearSRGBColorSpace,
  LoadingManager,
  MathUtils,
  PMREMGenerator,
  Scene,
  ShadowMapType,
  SRGBColorSpace,
  Texture,
  ToneMapping,
  Vector2,
  Vector3,
  WebGLCubeRenderTarget,
  HalfFloatType,
  LinearMipmapLinearFilter,
  WebGLRenderer,
} from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";

import { CameraManager } from "../camera/CameraManager";
import { Sun } from "../sun/Sun";
import { TimeManager } from "../time/TimeManager";
import { envValues, sunValues } from "../tweakpane/blades/environmentFolder";
import { rendererValues } from "../tweakpane/blades/rendererFolder";
import { TweakPane } from "../tweakpane/TweakPane";

import { PostProcessingManager } from "./PostProcessingManager";

type ComposerContructorArgs = {
  scene: Scene;
  cameraManager: CameraManager;
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
  fog?: {
    fogNear?: number;
    fogFar?: number;
    fogColor?: {
      r: number;
      g: number;
      b: number;
    };
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
  private readonly cameraManager: CameraManager;
  public readonly renderer: WebGLRenderer;

  private postProcessingManager: PostProcessingManager;

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
  private sky: Sky | null = null;
  private skyCubeCamera: CubeCamera | null = null;
  private skyRenderTarget: WebGLCubeRenderTarget | null = null;

  constructor({
    scene,
    cameraManager,
    spawnSun = false,
    environmentConfiguration,
  }: ComposerContructorArgs) {
    this.scene = scene;
    this.cameraManager = cameraManager;
    this.postPostScene = new Scene();
    this.spawnSun = spawnSun;
    this.renderer = new WebGLRenderer({
      powerPreference: "high-performance",
      antialias: true,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.info.autoReset = false;
    this.renderer.setSize(this.width, this.height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = rendererValues.shadowMap as ShadowMapType;
    this.renderer.toneMapping = rendererValues.toneMapping as ToneMapping;
    this.renderer.toneMappingExposure = rendererValues.exposure;

    this.environmentConfiguration = environmentConfiguration;

    this.postProcessingManager = new PostProcessingManager(
      this.renderer,
      this.scene,
      this.cameraManager.activeCamera,
      this.width,
      this.height,
      {
        bloom: { intensity: environmentConfiguration?.postProcessing?.bloomIntensity },
      },
    );

    this.updateSkyboxAndEnvValues();
    this.updateAmbientLightValues();
    this.updateFogValues();

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
    this.setupSkyShader();

    this.resizeListener = () => {
      this.fitContainer();
    };
    window.addEventListener("resize", this.resizeListener, false);
    this.fitContainer();
  }

  private setupSkyShader() {
    if (this.hasHDR()) {
      return;
    }
    this.sky = new Sky();
    this.sky.scale.setScalar(50000);

    this.sky.material.uniforms.sunPosition.value = new Vector3().setFromSphericalCoords(
      1,
      MathUtils.degToRad(sunValues.sunPosition.sunPolarAngle),
      MathUtils.degToRad(sunValues.sunPosition.sunAzimuthalAngle),
    );

    this.sky.material.uniforms.turbidity.value = sunValues.skyTurbidity;
    this.sky.material.uniforms.rayleigh.value = sunValues.skyRayleigh;
    this.sky.material.uniforms.mieCoefficient.value = sunValues.skyMieCoefficient;
    this.sky.material.uniforms.mieDirectionalG.value = sunValues.skyMieDirectionalG;

    this.skyRenderTarget = new WebGLCubeRenderTarget(512, {
      type: HalfFloatType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
    });

    this.skyCubeCamera = new CubeCamera(1, 1.1, this.skyRenderTarget);
    this.skyCubeCamera.update(this.renderer, this.sky);
    this.scene.environment = this.skyRenderTarget.texture;
    this.scene.add(this.sky);
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
    this.updateBloomValues();
    this.updateSunValues();
    this.updateFogValues();
  }

  public setupTweakPane(tweakPane: TweakPane) {
    tweakPane.setupRenderPane(
      this.postProcessingManager.effectComposer,
      this.postProcessingManager.n8ssaoPass,
      this.postProcessingManager.toneMappingEffectInstance,
      this.postProcessingManager.toneMappingPassInstance,
      this.postProcessingManager.bcsInstance,
      this.postProcessingManager.bloomEffectInstance,
      this.postProcessingManager.gaussGrainEffectInstance,
      this.spawnSun,
      this.updateSun.bind(this),
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
      this.updateSkyShaderValues.bind(this),
    );

    tweakPane.setupPostProcessingPane(this.postProcessingManager);
  }

  public dispose() {
    window.removeEventListener("resize", this.resizeListener);
    this.renderer.dispose();
    this.postProcessingManager.dispose();
  }

  public fitContainer() {
    if (!this) {
      console.warn("Composer not initialized");
      return;
    }
    const parentElement = this.renderer.domElement.parentNode as HTMLElement;
    if (!parentElement) {
      return;
    }
    this.width = parentElement.clientWidth;
    this.height = parentElement.clientHeight;
    this.cameraManager.activeCamera.aspect = this.width / this.height;
    this.cameraManager.activeCamera.updateProjectionMatrix();
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.resolution.set(
      this.width * window.devicePixelRatio,
      this.height * window.devicePixelRatio,
    );

    // delegate post-processing resize to manager
    this.postProcessingManager.resizeActiveEffects(this.width, this.height);
    this.renderer.setSize(this.width, this.height);
  }

  public render(timeManager: TimeManager): void {
    if (!this.renderer || !this.scene || !this.cameraManager.activeCamera) {
      return;
    }
    this.renderer.info.reset();
    if (this.sky && this.skyCubeCamera && this.skyRenderTarget) {
      this.skyCubeCamera?.update(this.renderer, this.sky);
      this.scene.environment = this.skyRenderTarget.texture;
    }
    if (this.postProcessingManager.isGloballyEnabled) {
      this.postProcessingManager.render(timeManager);
    } else {
      this.renderer.render(this.scene, this.cameraManager.activeCamera);
    }
    this.renderer.clearDepth();
    this.renderer.render(this.postPostScene, this.cameraManager.activeCamera);
  }

  private hasHDR(): boolean {
    if (!this.environmentConfiguration?.skybox) {
      return false;
    } else {
      const hasHDRJPG = "hdrJpgUrl" in this.environmentConfiguration.skybox;
      const hasHDRi = "hdrUrl" in this.environmentConfiguration.skybox;
      return hasHDRJPG || hasHDRi;
    }
  }

  public updateSkyboxRotation() {
    if (this.sky) {
      return;
    }
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
    if (envValues.fog.fogFar === 0) {
      this.scene.fog = null;
      return;
    }
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

  public updateSkyShaderValues() {
    if (!this.sky) {
      return;
    }
    const polarAngle = MathUtils.degToRad(sunValues.sunPosition.sunPolarAngle);
    const azimuthalAngle = MathUtils.degToRad(sunValues.sunPosition.sunAzimuthalAngle);
    const sunPosition = new Vector3().setFromSphericalCoords(1, polarAngle, azimuthalAngle);

    this.sky.material.uniforms.sunPosition.value = sunPosition;
    this.sky.material.uniforms.turbidity.value = sunValues.skyTurbidity;
    this.sky.material.uniforms.rayleigh.value = sunValues.skyRayleigh;
    this.sky.material.uniforms.mieCoefficient.value = sunValues.skyMieCoefficient;
    this.sky.material.uniforms.mieDirectionalG.value = sunValues.skyMieDirectionalG;
  }

  public updateSunValues() {
    if (typeof this.environmentConfiguration?.sun?.intensity === "number") {
      sunValues.sunIntensity = this.environmentConfiguration.sun.intensity;
      this.sun?.setIntensity(this.environmentConfiguration.sun.intensity);
    }
    if (typeof this.environmentConfiguration?.sun?.azimuthalAngle === "number") {
      sunValues.sunPosition.sunAzimuthalAngle = this.environmentConfiguration.sun.azimuthalAngle;
    }
    if (typeof this.environmentConfiguration?.sun?.polarAngle === "number") {
      sunValues.sunPosition.sunPolarAngle = this.environmentConfiguration.sun.polarAngle;
    }
    const { sunAzimuthalAngle, sunPolarAngle } = sunValues.sunPosition;
    const radAzimuthalAngle = MathUtils.degToRad(sunAzimuthalAngle);
    const radPolarAngle = MathUtils.degToRad(sunPolarAngle);
    this.sun?.setAzimuthalAngle(radAzimuthalAngle);
    this.sun?.setPolarAngle(radPolarAngle);
    if (this.sky) {
      this.updateSkyShaderValues();
    }
  }

  public updateSun() {
    if (!this.sun) {
      return;
    }
    this.sun.setAzimuthalAngle(MathUtils.degToRad(sunValues.sunPosition.sunAzimuthalAngle));
    this.sun.setPolarAngle(MathUtils.degToRad(sunValues.sunPosition.sunPolarAngle));
    this.sun.setIntensity(sunValues.sunIntensity);
    this.sun.setColor();
    if (this.sky) {
      this.updateSkyShaderValues();
    }
  }

  private updateFogValues() {
    if (typeof this.environmentConfiguration?.fog?.fogNear === "number") {
      envValues.fog.fogNear = this.environmentConfiguration.fog.fogNear;
    }
    if (typeof this.environmentConfiguration?.fog?.fogFar === "number") {
      envValues.fog.fogFar = this.environmentConfiguration.fog.fogFar;
    }
    if (
      typeof this.environmentConfiguration?.fog?.fogColor?.r === "number" &&
      typeof this.environmentConfiguration?.fog?.fogColor?.g === "number" &&
      typeof this.environmentConfiguration?.fog?.fogColor?.b === "number"
    ) {
      envValues.fog.fogColor.r = this.environmentConfiguration.fog.fogColor.r;
      envValues.fog.fogColor.g = this.environmentConfiguration.fog.fogColor.g;
      envValues.fog.fogColor.b = this.environmentConfiguration.fog.fogColor.b;
    }
    this.setFog();
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

  private updateBloomValues() {
    if (typeof this.environmentConfiguration?.postProcessing?.bloomIntensity === "number") {
      this.postProcessingManager.updateEffectConfiguration({
        bloom: { intensity: this.environmentConfiguration.postProcessing.bloomIntensity },
      });
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
    if (this.sky) {
      return;
    }
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
