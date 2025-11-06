import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ShaderPass,
  ToneMappingEffect,
  FXAAEffect,
} from "postprocessing";
import { PerspectiveCamera, HalfFloatType, Scene, Vector2, WebGLRenderer } from "three";

import { TimeManager } from "../time/TimeManager";
import { bcsValues } from "../tweakpane/blades/effects/bcsFolder";
import { bloomAndGrainValues } from "../tweakpane/blades/effects/bloomAndGrain";
import { n8ssaoValues } from "../tweakpane/blades/effects/ssaoFolder";
import { toneMappingValues } from "../tweakpane/blades/effects/toneMappingFolder";

import { BrightnessContrastSaturation } from "./post-effects/bright-contrast-sat";
import { GaussGrainEffect } from "./post-effects/gauss-grain";
import { N8SSAOPass } from "./post-effects/n8-ssao/N8SSAOPass";

export const PP_GLOBALLY_ENABLED = true;

export interface EffectState {
  name: string;
  enabled: boolean;
  wasEnabledBeforeGlobalDisable: boolean;
  instance: any; // Effect, Pass, or ShaderPass
  passIndex?: number;
}

export interface PostProcessingConfig {
  enabled?: boolean;
  bloom?: { intensity?: number };
  bcs?: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
  };
  grain?: { amount?: number };
  ssao?: {
    enabled?: boolean;
    halfRes?: boolean;
    aoRadius?: number;
    distanceFalloff?: number;
    intensity?: number;
    aoSamples?: number;
    denoiseSamples?: number;
    denoiseRadius?: number;
  };
  toneMapping?: {
    mode?: number;
    resolution?: number;
    whitePoint?: number;
    middleGrey?: number;
    minLuminance?: number;
    averageLuminance?: number;
    adaptationRate?: number;
  };
}

export class PostProcessingManager {
  public isGloballyEnabled: boolean = PP_GLOBALLY_ENABLED;
  public effectComposer: EffectComposer;

  private effectStates = new Map<string, EffectState>();
  private renderPass: RenderPass;

  // effect instances
  private fxaaEffect: FXAAEffect;
  private fxaaPass: EffectPass;
  private bloomEffect: BloomEffect;
  private bloomPass: EffectPass;
  private toneMappingEffect: ToneMappingEffect;
  private toneMappingPass: EffectPass;
  private n8aopass: N8SSAOPass;
  private bcs = BrightnessContrastSaturation;
  private bcsPass: ShaderPass;
  private gaussGrainEffect = GaussGrainEffect;
  private gaussGrainPass: ShaderPass;

  public resolution: Vector2;

  constructor(
    private renderer: WebGLRenderer,
    private scene: Scene,
    private camera: PerspectiveCamera,
    private width: number,
    private height: number,
    initialConfig?: PostProcessingConfig,
  ) {
    this.isGloballyEnabled = initialConfig?.enabled ?? PP_GLOBALLY_ENABLED;
    this.resolution = new Vector2(this.width, this.height);

    this.effectComposer = new EffectComposer(this.renderer, {
      frameBufferType: HalfFloatType,
    });

    this.initializeEffects(initialConfig);
    this.setupPipeline();
  }

  private initializeEffects(config?: PostProcessingConfig) {
    this.fxaaEffect = new FXAAEffect();

    this.bloomEffect = new BloomEffect({
      intensity: config?.bloom?.intensity ?? bloomAndGrainValues.bloom,
    });

    this.toneMappingEffect = new ToneMappingEffect({
      mode: config?.toneMapping?.mode ?? toneMappingValues.mode,
      resolution: config?.toneMapping?.resolution ?? toneMappingValues.resolution,
      whitePoint: config?.toneMapping?.whitePoint ?? toneMappingValues.whitePoint,
      middleGrey: config?.toneMapping?.middleGrey ?? toneMappingValues.middleGrey,
      minLuminance: config?.toneMapping?.minLuminance ?? toneMappingValues.minLuminance,
      averageLuminance: config?.toneMapping?.averageLuminance ?? toneMappingValues.averageLuminance,
      adaptationRate: config?.toneMapping?.adaptationRate ?? toneMappingValues.adaptationRate,
    });

    this.n8aopass = new N8SSAOPass(this.scene, this.camera, this.width, this.height);

    // Configure N8SSAO
    this.n8aopass.configuration.halfRes = config?.ssao?.halfRes ?? n8ssaoValues.halfRes;
    this.n8aopass.configuration.aoRadius = config?.ssao?.aoRadius ?? n8ssaoValues.aoRadius;
    this.n8aopass.configuration.distanceFalloff =
      config?.ssao?.distanceFalloff ?? n8ssaoValues.distanceFalloff;
    this.n8aopass.configuration.intensity = config?.ssao?.intensity ?? n8ssaoValues.intensity;
    this.n8aopass.configuration.aoSamples = config?.ssao?.aoSamples ?? n8ssaoValues.aoSamples;
    this.n8aopass.configuration.denoiseSamples =
      config?.ssao?.denoiseSamples ?? n8ssaoValues.denoiseSamples;
    this.n8aopass.configuration.denoiseRadius =
      config?.ssao?.denoiseRadius ?? n8ssaoValues.denoiseRadius;

    // Create passes
    this.fxaaPass = new EffectPass(this.camera, this.fxaaEffect);
    this.bloomPass = new EffectPass(this.camera, this.bloomEffect);
    this.toneMappingPass = new EffectPass(this.camera, this.toneMappingEffect);

    // Configure BCS
    this.bcsPass = new ShaderPass(this.bcs, "tDiffuse");
    this.bcs.uniforms.brightness.value = config?.bcs?.brightness ?? bcsValues.brightness;
    this.bcs.uniforms.contrast.value = config?.bcs?.contrast ?? bcsValues.contrast;
    this.bcs.uniforms.saturation.value = config?.bcs?.saturation ?? bcsValues.saturation;

    // Configure Grain
    this.gaussGrainPass = new ShaderPass(this.gaussGrainEffect, "tDiffuse");
    this.gaussGrainEffect.uniforms.amount.value =
      config?.grain?.amount ?? bloomAndGrainValues.grain;
    this.gaussGrainEffect.uniforms.alpha.value = 1.0;

    // Register all effects with their initial states
    this.registerEffect("n8ssao", this.n8aopass, config?.ssao?.enabled ?? n8ssaoValues.enabled);
    this.registerEffect("fxaa", this.fxaaPass, true);
    this.registerEffect("bloom", this.bloomPass, true);
    this.registerEffect("toneMapping", this.toneMappingPass, true);
    this.registerEffect("bcs", this.bcsPass, true);
    this.registerEffect("grain", this.gaussGrainPass, true);
  }

  private registerEffect(name: string, instance: any, defaultEnabled: boolean = true) {
    this.effectStates.set(name, {
      name,
      enabled: defaultEnabled,
      wasEnabledBeforeGlobalDisable: defaultEnabled,
      instance,
    });
  }

  private setupPipeline() {
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.effectComposer.addPass(this.renderPass);
    this.rebuildPipeline();
  }

  private rebuildPipeline() {
    // remove all passes except render pass
    while (this.effectComposer.passes.length > 1) {
      this.effectComposer.removePass(this.effectComposer.passes[1]);
    }

    if (!this.isGloballyEnabled) return;

    // add enabled effects in the correct order
    const effectOrder = ["n8ssao", "fxaa", "bloom", "toneMapping", "bcs", "grain"];

    effectOrder.forEach((effectName) => {
      const effectState = this.effectStates.get(effectName);
      if (effectState?.enabled) {
        this.effectComposer.addPass(effectState.instance);
        effectState.passIndex = this.effectComposer.passes.length - 1;
      }
    });
  }

  public enableEffect(name: string) {
    const effectState = this.effectStates.get(name);
    if (effectState && !effectState.enabled) {
      effectState.enabled = true;
      effectState.wasEnabledBeforeGlobalDisable = true;
      if (this.isGloballyEnabled) {
        this.rebuildPipeline();
      }
    }
  }

  public disableEffect(name: string) {
    const effectState = this.effectStates.get(name);
    if (effectState && effectState.enabled) {
      effectState.enabled = false;
      effectState.wasEnabledBeforeGlobalDisable = false;
      if (this.isGloballyEnabled) {
        this.rebuildPipeline();
      }
    }
  }

  public toggleGlobalPostProcessing(enabled?: boolean) {
    this.isGloballyEnabled = enabled ?? !this.isGloballyEnabled;

    if (this.isGloballyEnabled) {
      // restore previously enabled effects
      this.effectStates.forEach((state) => {
        state.enabled = state.wasEnabledBeforeGlobalDisable;
      });
    } else {
      // store current states and disable all
      this.effectStates.forEach((state) => {
        state.wasEnabledBeforeGlobalDisable = state.enabled;
        state.enabled = false;
      });
    }

    this.rebuildPipeline();
  }

  public updateEffectConfiguration(config: PostProcessingConfig) {
    if (config.bloom?.intensity !== undefined) {
      this.bloomEffect.intensity = config.bloom.intensity;
      bloomAndGrainValues.bloom = config.bloom.intensity;
    }

    if (config.bcs?.brightness !== undefined) {
      this.bcs.uniforms.brightness.value = config.bcs.brightness;
      bcsValues.brightness = config.bcs.brightness;
    }
    if (config.bcs?.contrast !== undefined) {
      this.bcs.uniforms.contrast.value = config.bcs.contrast;
      bcsValues.contrast = config.bcs.contrast;
    }
    if (config.bcs?.saturation !== undefined) {
      this.bcs.uniforms.saturation.value = config.bcs.saturation;
      bcsValues.saturation = config.bcs.saturation;
    }

    if (config.grain?.amount !== undefined) {
      this.gaussGrainEffect.uniforms.amount.value = config.grain.amount;
      bloomAndGrainValues.grain = config.grain.amount;
    }

    if (config.ssao) {
      if (
        config.ssao.enabled !== undefined &&
        config.ssao.enabled !== this.isEffectEnabled("n8ssao")
      ) {
        if (config.ssao.enabled) {
          this.enableEffect("n8ssao");
        } else {
          this.disableEffect("n8ssao");
        }
      }
      if (config.ssao.aoRadius !== undefined) {
        this.n8aopass.configuration.aoRadius = config.ssao.aoRadius;
      }
      if (config.ssao.distanceFalloff !== undefined) {
        this.n8aopass.configuration.distanceFalloff = config.ssao.distanceFalloff;
      }
      if (config.ssao.intensity !== undefined) {
        this.n8aopass.configuration.intensity = config.ssao.intensity;
      }
      if (config.ssao.aoSamples !== undefined) {
        this.n8aopass.configuration.aoSamples = config.ssao.aoSamples;
      }
      if (config.ssao.denoiseSamples !== undefined) {
        this.n8aopass.configuration.denoiseSamples = config.ssao.denoiseSamples;
      }
      if (config.ssao.denoiseRadius !== undefined) {
        this.n8aopass.configuration.denoiseRadius = config.ssao.denoiseRadius;
      }
    }

    if (config.toneMapping) {
      Object.keys(config.toneMapping).forEach((key) => {
        if (config.toneMapping![key as keyof typeof config.toneMapping] !== undefined) {
          (this.toneMappingEffect as any)[key] =
            config.toneMapping![key as keyof typeof config.toneMapping];
        }
      });
    }
  }

  public updateCamera(camera: PerspectiveCamera): void {
    this.camera = camera;
    // remove old render pass and create new one with updated camera
    this.effectComposer.removePass(this.renderPass);
    this.renderPass = new RenderPass(this.scene, camera);
    this.effectComposer.addPass(this.renderPass, 0); // Add at beginning
    this.rebuildPipeline();
  }

  public resizeActiveEffects(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.resolution.set(
      this.width * window.devicePixelRatio,
      this.height * window.devicePixelRatio,
    );

    // EffectComposer should match renderer size (without devicePixelRatio division)
    this.effectComposer.setSize(this.width, this.height);
    this.renderPass.setSize(this.width, this.height);

    // only resize currently enabled effects with the same dimensions
    this.effectStates.forEach((state) => {
      if (state.enabled && state.instance.setSize) {
        state.instance.setSize(this.width, this.height);
      }
    });

    // update grain effect resolution
    if (this.isEffectEnabled("grain")) {
      this.gaussGrainEffect.uniforms.resolution.value = new Vector2(this.width, this.height);
    }
  }

  public render(timeManager: TimeManager) {
    // update time-dependent effects only if enabled
    if (this.isEffectEnabled("grain")) {
      this.gaussGrainEffect.uniforms.time.value = timeManager.time;
    }

    this.effectComposer.render();
  }

  public getEffectState(name: string): EffectState | undefined {
    return this.effectStates.get(name);
  }

  public getAllEffectStates(): EffectState[] {
    return Array.from(this.effectStates.values());
  }

  public isEffectEnabled(name: string): boolean {
    return this.effectStates.get(name)?.enabled ?? false;
  }

  public get n8ssaoPass(): N8SSAOPass {
    return this.n8aopass;
  }

  public get toneMappingEffectInstance(): ToneMappingEffect {
    return this.toneMappingEffect;
  }

  public get toneMappingPassInstance(): EffectPass {
    return this.toneMappingPass;
  }

  public get bcsInstance(): typeof BrightnessContrastSaturation {
    return this.bcs;
  }

  public get bloomEffectInstance(): BloomEffect {
    return this.bloomEffect;
  }

  public get gaussGrainEffectInstance(): typeof GaussGrainEffect {
    return this.gaussGrainEffect;
  }

  public dispose() {
    this.effectComposer.dispose();
  }
}
