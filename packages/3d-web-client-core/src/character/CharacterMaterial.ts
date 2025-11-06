import { Color, MeshStandardMaterial, UniformsUtils } from "three";

import { CameraManager } from "../camera/CameraManager";
import { ease } from "../helpers/math-helpers";
import { bayerDither } from "../rendering/shaders/bayer-dither";
import {
  injectBefore,
  injectBeforeMain,
  injectInsideMain,
} from "../rendering/shaders/shader-helpers";
import { characterValues } from "../tweakpane/blades/characterFolder";

type TUniform<TValue = any> = { value: TValue };

export type CharacterMaterialConfig = {
  isLocal: boolean;
  cameraManager: CameraManager;
  characterId: number;
  originalMaterial: MeshStandardMaterial;
  colorOverride?: Color;
};

export class CharacterMaterial extends MeshStandardMaterial {
  private uniforms: Record<string, TUniform> = {
    discardAll: { value: 1 },
    diffuseColor: { value: new Color() },
    map: { value: null },
  };
  private colorsCube216: Color[] = [];
  private targetAlpha: number = 1;
  private currentAlpha: number = 1;

  constructor(private config: CharacterMaterialConfig) {
    super();
    this.copy(this.config.originalMaterial);
    this.generateColorCube();

    this.color = this.config.colorOverride || this.colorsCube216[this.config.characterId];
    this.envMapIntensity = characterValues.envMapIntensity;
    this.transparent = true;
    this.side = this.config.originalMaterial.side;

    this.onBeforeCompile = (shader) => {
      this.uniforms = UniformsUtils.clone(shader.uniforms);
      this.uniforms.nearClip = { value: 0.01 };
      this.uniforms.farClip = { value: 1000.0 };
      this.uniforms.ditheringNear = { value: 0.3 };
      this.uniforms.ditheringRange = { value: 0.5 };
      this.uniforms.time = { value: 0.0 };
      this.uniforms.diffuseRandomColor = { value: new Color() };
      this.uniforms.discardAll = { value: 0 };
      shader.uniforms = this.uniforms;

      shader.vertexShader = "varying vec3 vWorldPosition;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        "vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );\nvWorldPosition = worldPosition.xyz;",
      );
      shader.vertexShader = injectBeforeMain(shader.vertexShader, "varying vec2 vUv;");
      shader.vertexShader = injectInsideMain(shader.vertexShader, "vUv = uv;");

      shader.fragmentShader = injectBeforeMain(
        shader.fragmentShader,
        /* glsl */ `
          varying vec2 vUv;
          varying vec3 vWorldPosition;
          uniform float nearClip;
          uniform float farClip;
          uniform float ditheringNear;
          uniform float ditheringRange;
          uniform float time;
          uniform vec3 diffuseRandomColor;
          uniform int discardAll;
          ${bayerDither}
        `,
      );

      shader.fragmentShader = injectBefore(
        shader.fragmentShader,
        "#include <dithering_fragment>",
        /* glsl */ `
          if (discardAll == 1) {
            discard;
          } else {
            float distance = length(vWorldPosition - cameraPosition);
            float normalizedDistance = (distance - nearClip) / (farClip - nearClip);
            ivec2 p = ivec2(mod(gl_FragCoord.xy, 8.0));
            float d = 0.0;
            if (p.x <= 3 && p.y <= 3) {
              d = bayerDither(bayertl, p);
            } else if (p.x > 3 && p.y <= 3) {
              d = bayerDither(bayertr, p - ivec2(4, 0));
            } else if (p.x <= 3 && p.y > 3) {
              d = bayerDither(bayerbl, p - ivec2(0, 4));
            } else if (p.x > 3 && p.y > 3) {
              d = bayerDither(bayerbr, p - ivec2(4, 4));
            }
            if (distance <= ditheringNear + d * ditheringRange) discard;  
            outgoingLight *= diffuseRandomColor;  
          }
        `,
      );
    };
    this.needsUpdate = true;
  }

  private generateColorCube() {
    const saturation = 1.0;
    const lightness = 0.9;
    const goldenRatioConjugate = 0.618033988749895;
    let hue = 0;

    for (let i = 0; i < 216; i++) {
      const color = new Color();
      color.setHSL(hue, saturation, lightness);
      this.colorsCube216.push(color);
      hue = (hue + goldenRatioConjugate) % 1;
    }
  }

  public update() {
    if (this.config.isLocal) {
      this.targetAlpha = this.config.cameraManager.distance < 0.4 ? 0.0 : 1.0;
      this.currentAlpha += ease(this.targetAlpha, this.currentAlpha, 0.07);
      if (this.currentAlpha > 0.999) {
        this.currentAlpha = 1;
        this.config.cameraManager.minPolarAngle = Math.PI * 0.25;
      }
      if (this.currentAlpha < 0.001) {
        this.currentAlpha = 0;
        this.config.cameraManager.minPolarAngle = Math.PI * 0.35;
      }
      this.uniforms.discardAll.value = this.currentAlpha === 0 ? 1 : 0;
      if (this.currentAlpha !== this.opacity) {
        this.opacity = this.currentAlpha;
      }
    }
    if (characterValues.overrideMaterialParams) {
      this.metalness = characterValues.metalness;
      this.roughness = characterValues.roughness;
      this.emissive = new Color().setRGB(
        characterValues.emissive.r,
        characterValues.emissive.g,
        characterValues.emissive.b,
      );
      this.emissiveIntensity = characterValues.emissiveIntensity;
      this.envMapIntensity = characterValues.envMapIntensity;
    }
  }
}
