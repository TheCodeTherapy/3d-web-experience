// Original code from: https://github.com/N8python/n8ao
// ported to TypeScript

import { Pass } from "postprocessing";
import {
  Color,
  DataTexture,
  FloatType,
  Fog,
  FogExp2,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  NoColorSpace,
  OrthographicCamera,
  PerspectiveCamera,
  RGBAFormat,
  RedFormat,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  Texture,
  Uniform,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";

import { BlueNoise } from "./BlueNoise";
import { DepthDownSample } from "./DepthDownSample";
import { EffectCompositer } from "./EffectCompositer";
import { EffectShader } from "./EffectShader";
import { FullScreenTriangle } from "./FullScreenTriangle";
import { PoissionBlur } from "./PoissionBlur";

const bluenoiseBits: Uint8Array = Uint8Array.from(atob(BlueNoise), (c) => c.charCodeAt(0));

export type RenderModeType = "Combined" | "AO" | "No AO" | "Split" | "Split AO";

type PresetsType = "Performance" | "Low" | "Medium" | "High" | "Ultra";

interface IConfiguration {
  aoSamples: number;
  aoRadius: number;
  denoiseSamples: number;
  denoiseRadius: number;
  distanceFalloff: number;
  intensity: number;
  denoiseIterations: number;
  renderMode: number;
  color: Color;
  gammaCorrection: boolean;
  logarithmicDepthBuffer: boolean;
  screenSpaceRadius: boolean;
  halfRes: boolean;
  depthAwareUpsampling: boolean;
  colorMultiply: boolean;
}

function checkTimerQuery(
  timerQuery: WebGLQuery,
  gl: WebGL2RenderingContext,
  pass: N8SSAOPass,
): void {
  const available = gl.getQueryParameter(timerQuery, gl.QUERY_RESULT_AVAILABLE);
  if (available) {
    const elapsedTimeInNs = gl.getQueryParameter(timerQuery, gl.QUERY_RESULT);
    const elapsedTimeInMs = elapsedTimeInNs / 1000000;
    pass.lastTime = elapsedTimeInMs;
  } else {
    setTimeout(() => checkTimerQuery(timerQuery, gl, pass), 1);
  }
}

class N8SSAOPass extends Pass {
  private debugMode: boolean;

  public scene: Scene;
  public camera: PerspectiveCamera | OrthographicCamera;
  public lastTime: number = 0;

  private width: number;
  private height: number;

  public configuration: IConfiguration & ProxyHandler<IConfiguration>;

  private autosetGamma: boolean = true;
  private samples: Vector3[] = [];
  private samplesR: number[] = [];
  private samplesDenoise: Vector2[] = [];

  private copyQuadMaterial: ShaderMaterial = new ShaderMaterial({
    uniforms: { tDiffuse: new Uniform(null) },

    depthWrite: false,

    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(void) {
        vUv = uv;
        gl_Position = vec4(position, 1);
      }
    `,

    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main(void) {
        gl_FragColor = texture2D(tDiffuse, vUv);
      }
    `,
  });

  private copyQuad: FullScreenTriangle = new FullScreenTriangle(this.copyQuadMaterial);

  private writeTargetInternal: WebGLRenderTarget;
  private readTargetInternal: WebGLRenderTarget;
  private outputTargetInternal: WebGLRenderTarget;
  private depthDownsampleTarget: WebGLRenderTarget | null;

  private depthDownsampleQuad: FullScreenTriangle | null;
  private effectShaderQuad: FullScreenTriangle | null;
  private effectCompositerQuad: FullScreenTriangle | null;
  private poissonBlurQuad: FullScreenTriangle | null;

  private depthTexture: Texture;
  private bluenoise: DataTexture;

  private r: Vector2;
  private c: Color;

  constructor(
    scene: Scene,
    camera: PerspectiveCamera | OrthographicCamera,
    width = 512,
    height = 512,
  ) {
    super();
    this.width = width;
    this.height = height;

    this.camera = camera;
    this.scene = scene;

    this.configuration = new Proxy(
      {
        aoSamples: 16,
        aoRadius: 5.0,
        denoiseSamples: 8,
        denoiseRadius: 12,
        distanceFalloff: 1.0,
        intensity: 5,
        denoiseIterations: 2.0,
        renderMode: 0,
        color: new Color(0, 0, 0),
        gammaCorrection: true,
        logarithmicDepthBuffer: false,
        screenSpaceRadius: false,
        halfRes: false,
        depthAwareUpsampling: true,
        colorMultiply: true,
      },
      {
        set: (target: any, propName: string, value: any) => {
          const oldProp = target[propName];
          target[propName] = value;
          if (propName === "aoSamples" && oldProp !== value) {
            this.configureAOPass(this.configuration.logarithmicDepthBuffer);
          }
          if (propName === "denoiseSamples" && oldProp !== value) {
            this.configureDenoisePass(this.configuration.logarithmicDepthBuffer);
          }
          if (propName === "halfRes" && oldProp !== value) {
            this.configureAOPass(this.configuration.logarithmicDepthBuffer);
            this.configureHalfResTargets();
            this.configureEffectCompositer(this.configuration.logarithmicDepthBuffer);
            this.setSize(this.width, this.height);
          }
          if (propName === "depthAwareUpsampling" && oldProp !== value) {
            this.configureEffectCompositer(this.configuration.logarithmicDepthBuffer);
          }
          if (propName === "gammaCorrection") {
            this.autosetGamma = false;
          }
          return true;
        },
      },
    );

    this.configureEffectCompositer(this.configuration.logarithmicDepthBuffer);
    this.configureSampleDependentPasses();
    this.configureHalfResTargets();

    this.writeTargetInternal = new WebGLRenderTarget(this.width, this.height, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    });

    this.readTargetInternal = new WebGLRenderTarget(this.width, this.height, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    });

    this.outputTargetInternal = new WebGLRenderTarget(this.width, this.height, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    });

    this.bluenoise = new DataTexture(bluenoiseBits, 128, 128);
    this.bluenoise.colorSpace = NoColorSpace;
    this.bluenoise.wrapS = RepeatWrapping;
    this.bluenoise.wrapT = RepeatWrapping;
    this.bluenoise.minFilter = NearestFilter;
    this.bluenoise.magFilter = NearestFilter;
    this.bluenoise.needsUpdate = true;
    this.lastTime = 0;
    this.needsDepthTexture = true;
    this.needsSwap = true;
    this.r = new Vector2();
    this.c = new Color();
  }

  private configureHalfResTargets(): void {
    if (this.configuration.halfRes) {
      this.depthDownsampleTarget = new WebGLRenderTarget(this.width / 2, this.height / 2, {
        count: 2,
        depthBuffer: false,
      });
      this.depthDownsampleTarget.textures[0].format = RedFormat;
      this.depthDownsampleTarget.textures[0].type = FloatType;
      this.depthDownsampleTarget.textures[0].minFilter = NearestFilter;
      this.depthDownsampleTarget.textures[0].magFilter = NearestFilter;
      this.depthDownsampleTarget.textures[1].format = RGBAFormat;
      this.depthDownsampleTarget.textures[1].type = HalfFloatType;
      this.depthDownsampleTarget.textures[1].minFilter = NearestFilter;
      this.depthDownsampleTarget.textures[1].magFilter = NearestFilter;
      this.depthDownsampleQuad = new FullScreenTriangle(new ShaderMaterial(DepthDownSample));
    } else {
      if (this.depthDownsampleTarget) {
        this.depthDownsampleTarget.dispose();
        this.depthDownsampleTarget = null;
      }
      if (this.depthDownsampleQuad) {
        this.depthDownsampleQuad.dispose();
        this.depthDownsampleQuad = null;
      }
    }
  }

  private configureSampleDependentPasses(): void {
    this.configureAOPass(this.configuration.logarithmicDepthBuffer);
    this.configureDenoisePass(this.configuration.logarithmicDepthBuffer);
  }

  private configureAOPass(logarithmicDepthBuffer = false): void {
    this.samples = this.generateHemisphereSamples(this.configuration.aoSamples);
    this.samplesR = this.generateHemisphereSamplesR(this.configuration.aoSamples);
    const e = { ...EffectShader };
    e.fragmentShader = e.fragmentShader
      .replace("16", this.configuration.aoSamples.toString())
      .replace("16.0", this.configuration.aoSamples.toString() + ".0");
    if (logarithmicDepthBuffer) {
      e.fragmentShader = "#define LOGDEPTH\n" + e.fragmentShader;
    }
    if (this.configuration.halfRes) {
      e.fragmentShader = "#define HALFRES\n" + e.fragmentShader;
    }
    if (this.effectShaderQuad) {
      this.effectShaderQuad.material.dispose();
      this.effectShaderQuad.material = new ShaderMaterial(e);
    } else {
      this.effectShaderQuad = new FullScreenTriangle(new ShaderMaterial(e));
    }
  }

  private configureDenoisePass(logarithmicDepthBuffer: boolean = false): void {
    this.samplesDenoise = this.generateDenoiseSamples(this.configuration.denoiseSamples, 11);
    const p = { ...PoissionBlur };
    p.fragmentShader = p.fragmentShader.replace("16", this.configuration.denoiseSamples.toString());
    if (logarithmicDepthBuffer) {
      p.fragmentShader = "#define LOGDEPTH\n" + p.fragmentShader;
    }
    if (this.poissonBlurQuad) {
      this.poissonBlurQuad.material.dispose();
      this.poissonBlurQuad.material = new ShaderMaterial(p);
    } else {
      this.poissonBlurQuad = new FullScreenTriangle(new ShaderMaterial(p));
    }
  }

  private configureEffectCompositer(logarithmicDepthBuffer: boolean = false): void {
    const e = { ...EffectCompositer };

    if (logarithmicDepthBuffer) {
      e.fragmentShader = "#define LOGDEPTH\n" + e.fragmentShader;
    }

    if (this.configuration.halfRes && this.configuration.depthAwareUpsampling) {
      e.fragmentShader = "#define HALFRES\n" + e.fragmentShader;
    }

    if (this.effectCompositerQuad) {
      this.effectCompositerQuad.material.dispose();
      this.effectCompositerQuad.material = new ShaderMaterial(e);
    } else {
      this.effectCompositerQuad = new FullScreenTriangle(new ShaderMaterial(e));
    }
  }

  private generateHemisphereSamples(n: number): Vector3[] {
    const points = [];
    for (let k = 0; k < n; k++) {
      const theta = 2.399963 * k;
      const r = Math.sqrt(k + 0.5) / Math.sqrt(n);
      const x = r * Math.cos(theta);
      const y = r * Math.sin(theta);

      const z = Math.sqrt(1 - (x * x + y * y));
      points.push(new Vector3(x, y, z));
    }
    return points;
  }

  private generateHemisphereSamplesR(n: number): number[] {
    const samplesR = [];
    for (let i = 0; i < n; i++) {
      samplesR.push((i + 1) / n);
    }
    return samplesR;
  }

  private generateDenoiseSamples(numSamples: number, numRings: number): Vector2[] {
    const angleStep = (2 * Math.PI * numRings) / numSamples;
    const invNumSamples = 1.0 / numSamples;
    const radiusStep = invNumSamples;
    const samples = [];
    let radius = invNumSamples;
    let angle = 0;
    for (let i = 0; i < numSamples; i++) {
      samples.push(
        new Vector2(Math.cos(angle), Math.sin(angle)).multiplyScalar(Math.pow(radius, 0.75)),
      );
      radius += radiusStep;
      angle += angleStep;
    }
    return samples;
  }

  public setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const c = this.configuration.halfRes ? 0.5 : 1;
    this.writeTargetInternal.setSize(width * c, height * c);
    this.readTargetInternal.setSize(width * c, height * c);
    if (this.configuration.halfRes && this.depthDownsampleTarget) {
      this.depthDownsampleTarget.setSize(width * c, height * c);
    }
    this.outputTargetInternal.setSize(width, height);
  }

  public setDepthTexture(depthTexture: DataTexture): void {
    this.depthTexture = depthTexture;
  }

  public render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    outputBuffer: WebGLRenderTarget,
  ): void {
    const xrEnabled = renderer.xr.enabled;
    renderer.xr.enabled = false;

    let ext: any;
    let timerQuery: WebGLQuery | null = null;
    let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
    gl = renderer.getContext();

    if (this.debugMode) {
      ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      if (ext === null) {
        console.error("EXT_disjoint_timer_query_webgl2 not available, disabling debug mode.");
        this.debugMode = false;
        gl = null;
      }
    }

    if (this.debugMode && gl) {
      timerQuery = (gl as WebGL2RenderingContext).createQuery()!;
      (gl as WebGL2RenderingContext).beginQuery(ext.TIME_ELAPSED_EXT, timerQuery);
    }

    if (
      renderer.capabilities.logarithmicDepthBuffer !== this.configuration.logarithmicDepthBuffer
    ) {
      this.configuration.logarithmicDepthBuffer = renderer.capabilities.logarithmicDepthBuffer;
      this.configureAOPass(this.configuration.logarithmicDepthBuffer);
      this.configureDenoisePass(this.configuration.logarithmicDepthBuffer);
      this.configureEffectCompositer(this.configuration.logarithmicDepthBuffer);
    }

    if (inputBuffer.texture.type !== this.outputTargetInternal.texture.type) {
      this.outputTargetInternal.texture.type = inputBuffer.texture.type;
      this.outputTargetInternal.texture.needsUpdate = true;
    }

    this.camera.updateMatrixWorld();
    this.r.set(this.width, this.height);
    let trueRadius = this.configuration.aoRadius;

    if (this.configuration.halfRes && this.configuration.screenSpaceRadius) {
      trueRadius *= 0.5;
    }

    if (this.configuration.halfRes && this.depthDownsampleQuad) {
      const depthDownsampleUniforms = this.depthDownsampleQuad.material.uniforms;
      renderer.setRenderTarget(this.depthDownsampleTarget);
      depthDownsampleUniforms.sceneDepth.value = this.depthTexture;
      depthDownsampleUniforms.resolution.value = this.r;
      depthDownsampleUniforms.near.value = this.camera.near;
      depthDownsampleUniforms.far.value = this.camera.far;
      depthDownsampleUniforms.projectionMatrixInv.value = this.camera.projectionMatrixInverse;
      depthDownsampleUniforms.viewMatrixInv.value = this.camera.matrixWorld;
      depthDownsampleUniforms.logDepth.value = this.configuration.logarithmicDepthBuffer;
      this.depthDownsampleQuad.render(renderer);
    }

    if (!this.effectShaderQuad) return;

    const effectShaderUniforms = this.effectShaderQuad.material.uniforms;

    effectShaderUniforms.sceneDiffuse.value = inputBuffer.texture;
    effectShaderUniforms.sceneDepth.value = this.configuration.halfRes
      ? this.depthDownsampleTarget!.textures[0]
      : this.depthTexture;
    effectShaderUniforms.sceneNormal.value = this.configuration.halfRes
      ? this.depthDownsampleTarget!.textures[1]
      : null;
    effectShaderUniforms.projMat.value = this.camera.projectionMatrix;
    effectShaderUniforms.viewMat.value = this.camera.matrixWorldInverse;
    effectShaderUniforms.projViewMat.value = this.camera.projectionMatrix
      .clone()
      .multiply(this.camera.matrixWorldInverse.clone());
    effectShaderUniforms.projectionMatrixInv.value = this.camera.projectionMatrixInverse;
    effectShaderUniforms.viewMatrixInv.value = this.camera.matrixWorld;
    effectShaderUniforms.cameraPos.value = this.camera.getWorldPosition(new Vector3());
    effectShaderUniforms.resolution.value = this.configuration.halfRes
      ? this.r
          .clone()
          .multiplyScalar(1 / 2)
          .floor()
      : this.r;
    effectShaderUniforms.time.value = performance.now() / 1000;
    effectShaderUniforms.samples.value = this.samples;
    effectShaderUniforms.samplesR.value = this.samplesR;
    effectShaderUniforms.bluenoise.value = this.bluenoise;
    effectShaderUniforms.radius.value = trueRadius;
    effectShaderUniforms.distanceFalloff.value = this.configuration.distanceFalloff;
    effectShaderUniforms.near.value = this.camera.near;
    effectShaderUniforms.far.value = this.camera.far;
    effectShaderUniforms.logDepth.value = renderer.capabilities.logarithmicDepthBuffer;
    effectShaderUniforms.ortho.value = this.camera instanceof OrthographicCamera;
    effectShaderUniforms.screenSpaceRadius.value = this.configuration.screenSpaceRadius;

    // Start the AO
    renderer.setRenderTarget(this.writeTargetInternal);
    this.effectShaderQuad.render(renderer);
    // End the AO

    const poissonBlurUniforms = this.poissonBlurQuad!.material.uniforms;

    // Start the blur
    for (let i = 0; i < this.configuration.denoiseIterations; i++) {
      if (!poissonBlurUniforms || !this.poissonBlurQuad) return;
      [this.writeTargetInternal, this.readTargetInternal] = [
        this.readTargetInternal,
        this.writeTargetInternal,
      ];
      poissonBlurUniforms.tDiffuse.value = this.readTargetInternal.texture;
      poissonBlurUniforms.sceneDepth.value = this.configuration.halfRes
        ? this.depthDownsampleTarget!.textures[0]
        : this.depthTexture;
      poissonBlurUniforms.projMat.value = this.camera.projectionMatrix;
      poissonBlurUniforms.viewMat.value = this.camera.matrixWorldInverse;
      poissonBlurUniforms.projectionMatrixInv.value = this.camera.projectionMatrixInverse;
      poissonBlurUniforms.viewMatrixInv.value = this.camera.matrixWorld;
      poissonBlurUniforms.cameraPos.value = this.camera.getWorldPosition(new Vector3());
      poissonBlurUniforms.resolution.value = this.configuration.halfRes
        ? this.r
            .clone()
            .multiplyScalar(1 / 2)
            .floor()
        : this.r;
      poissonBlurUniforms.time.value = performance.now() / 1000;
      poissonBlurUniforms.blueNoise.value = this.bluenoise;
      poissonBlurUniforms.radius.value =
        this.configuration.denoiseRadius * (this.configuration.halfRes ? 1 / 2 : 1);
      poissonBlurUniforms.worldRadius.value = trueRadius;
      poissonBlurUniforms.distanceFalloff.value = this.configuration.distanceFalloff;
      poissonBlurUniforms.index.value = i;
      poissonBlurUniforms.poissonDisk.value = this.samplesDenoise;
      poissonBlurUniforms.near.value = this.camera.near;
      poissonBlurUniforms.far.value = this.camera.far;
      poissonBlurUniforms.logDepth.value = renderer.capabilities.logarithmicDepthBuffer;
      poissonBlurUniforms.screenSpaceRadius.value = this.configuration.screenSpaceRadius;
      renderer.setRenderTarget(this.writeTargetInternal);
      this.poissonBlurQuad.render(renderer);
    }
    // End the blur

    const effectCompositerUniforms = this.effectCompositerQuad!.material.uniforms;

    // Start the composition
    if (!effectCompositerUniforms || !this.effectCompositerQuad) return;
    effectCompositerUniforms.sceneDiffuse.value = inputBuffer.texture;
    effectCompositerUniforms.sceneDepth.value = this.depthTexture;
    effectCompositerUniforms.near.value = this.camera.near;
    effectCompositerUniforms.far.value = this.camera.far;
    effectCompositerUniforms.projectionMatrixInv.value = this.camera.projectionMatrixInverse;
    effectCompositerUniforms.viewMatrixInv.value = this.camera.matrixWorld;
    effectCompositerUniforms.logDepth.value = renderer.capabilities.logarithmicDepthBuffer;
    effectCompositerUniforms.ortho.value = this.camera instanceof OrthographicCamera;
    effectCompositerUniforms.downsampledDepth.value = this.configuration.halfRes
      ? this.depthDownsampleTarget!.textures[0]
      : this.depthTexture;
    effectCompositerUniforms.resolution.value = this.r;
    effectCompositerUniforms.blueNoise.value = this.bluenoise;
    effectCompositerUniforms.intensity.value = this.configuration.intensity;
    effectCompositerUniforms.renderMode.value = this.configuration.renderMode;
    effectCompositerUniforms.screenSpaceRadius.value = this.configuration.screenSpaceRadius;
    effectCompositerUniforms.radius.value = trueRadius;
    effectCompositerUniforms.distanceFalloff.value = this.configuration.distanceFalloff;
    effectCompositerUniforms.gammaCorrection.value = this.autosetGamma
      ? this.renderToScreen
      : this.configuration.gammaCorrection;
    effectCompositerUniforms.tDiffuse.value = this.writeTargetInternal.texture;
    effectCompositerUniforms.color.value = this.c
      .copy(this.configuration.color)
      .convertSRGBToLinear();
    effectCompositerUniforms.colorMultiply.value = this.configuration.colorMultiply;
    effectCompositerUniforms.cameraPos.value = this.camera.getWorldPosition(new Vector3());
    effectCompositerUniforms.fog.value = !!this.scene.fog;

    if (this.scene.fog) {
      if (this.scene.fog instanceof Fog && this.scene.fog.isFog === true) {
        effectCompositerUniforms.fogExp.value = false;
        effectCompositerUniforms.fogNear.value = this.scene.fog.near;
        effectCompositerUniforms.fogFar.value = this.scene.fog.far;
      } else if (this.scene.fog instanceof FogExp2) {
        effectCompositerUniforms.fogExp.value = true;
        effectCompositerUniforms.fogDensity.value = this.scene.fog.density;
      } else {
        console.error(`Unsupported fog type ${this.scene.fog.constructor.name} in SSAOPass.`);
      }
    }

    renderer.setRenderTarget(this.outputTargetInternal);
    this.effectCompositerQuad.render(renderer);
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    this.copyQuad.material.uniforms.tDiffuse.value = this.outputTargetInternal.texture;
    this.copyQuad.render(renderer);

    if (this.debugMode && gl && timerQuery) {
      (gl as WebGL2RenderingContext).endQuery(ext.TIME_ELAPSED_EXT);
      checkTimerQuery(timerQuery as WebGLQuery, gl as WebGL2RenderingContext, this);
    }

    renderer.xr.enabled = xrEnabled;
  }

  public enableDebugMode(): void {
    this.debugMode = true;
  }

  public disableDebugMode(): void {
    this.debugMode = false;
  }

  public setDisplayMode(mode: "Combined" | "AO" | "No AO" | "Split" | "Split AO"): void {
    this.configuration.renderMode = ["Combined", "AO", "No AO", "Split", "Split AO"].indexOf(
      mode,
    ) as number;
  }

  public setQualityMode(mode: PresetsType): void {
    if (mode === "Performance") {
      this.configuration.aoSamples = 8;
      this.configuration.denoiseSamples = 4;
      this.configuration.denoiseRadius = 12;
    } else if (mode === "Low") {
      this.configuration.aoSamples = 16;
      this.configuration.denoiseSamples = 4;
      this.configuration.denoiseRadius = 12;
    } else if (mode === "Medium") {
      this.configuration.aoSamples = 16;
      this.configuration.denoiseSamples = 8;
      this.configuration.denoiseRadius = 12;
    } else if (mode === "High") {
      this.configuration.aoSamples = 64;
      this.configuration.denoiseSamples = 8;
      this.configuration.denoiseRadius = 6;
    } else if (mode === "Ultra") {
      this.configuration.aoSamples = 64;
      this.configuration.denoiseSamples = 16;
      this.configuration.denoiseRadius = 6;
    }
  }
}

export { N8SSAOPass };
