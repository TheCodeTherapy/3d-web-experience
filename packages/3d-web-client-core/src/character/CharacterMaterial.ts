import { Color, MeshPhysicalMaterial, UniformsUtils } from "three";

import { bayerDither } from "../rendering/shaders/bayer-dither";
import {
  injectBefore,
  injectBeforeMain,
  injectInsideMain,
} from "../rendering/shaders/shader-helpers";
import { characterValues } from "../tweakpane/blades/characterFolder";

type TUniform<TValue = any> = { value: TValue };

export class CharacterMaterial extends MeshPhysicalMaterial {
  public uniforms: Record<string, TUniform> = {};
  public colorsCube216: Color[] = [];

  constructor() {
    super();
    this.color = new Color(0xffffff);
    this.transmission = characterValues.transmission;
    this.metalness = characterValues.metalness;
    this.roughness = characterValues.roughness;
    this.ior = characterValues.ior;
    this.thickness = characterValues.thickness;
    this.specularColor = new Color().setRGB(
      characterValues.specularColor.r,
      characterValues.specularColor.g,
      characterValues.specularColor.b,
    );
    this.specularIntensity = characterValues.specularIntensity;
    this.emissive = new Color().setRGB(
      characterValues.emissive.r,
      characterValues.emissive.g,
      characterValues.emissive.b,
    );
    this.emissiveIntensity = characterValues.emissiveIntensity;
    this.envMapIntensity = characterValues.envMapIntensity;
    this.sheenColor = new Color().setRGB(
      characterValues.sheenColor.r,
      characterValues.sheenColor.g,
      characterValues.sheenColor.b,
    );
    this.sheen = characterValues.sheen;
    this.clearcoat = characterValues.clearcoat;
    this.clearcoatRoughness = characterValues.clearcoatRoughness;

    this.onBeforeCompile = (shader) => {
      this.uniforms = UniformsUtils.clone(shader.uniforms);
      this.uniforms.nearClip = { value: 0.01 };
      this.uniforms.farClip = { value: 1000.0 };
      this.uniforms.ditheringNear = { value: 0.25 };
      this.uniforms.ditheringRange = { value: 0.5 };
      this.uniforms.time = { value: 0.0 };
      this.uniforms.diffuseRandomColor = { value: new Color() };
      shader.uniforms = this.uniforms;

      shader.vertexShader = injectBeforeMain(shader.vertexShader, "varying vec2 vUv;");
      shader.vertexShader = injectInsideMain(shader.vertexShader, "vUv = uv;");

      shader.fragmentShader = injectBeforeMain(
        shader.fragmentShader,
        /* glsl */ `
          //#define showPattern
          varying vec2 vUv;
          uniform float nearClip;
          uniform float farClip;
          uniform float ditheringNear;
          uniform float ditheringRange;
          uniform float time;
          uniform vec3 diffuseRandomColor;
          ${bayerDither}

          #ifdef showPattern
          vec2 rand2(vec2 p) {
            return fract(vec2(sin(p.x * 591.32 + p.y * 154.077), cos(p.x * 391.32 + p.y * 49.077)));
          }
          float voronoi(in vec2 x) {
            vec2 p = floor(x);
            vec2 f = fract(x);
            float minDistance = 1.0;
            for(int j = -1; j <= 1; j ++)
            for(int i = -1; i <= 1; i ++) {
              vec2 b = vec2(i, j);
              vec2 rand = 0.5 + 0.5 * sin(time * 1.5 + 12.0 * rand2(p + b));
              vec2 r = vec2(b) - f + rand;
              minDistance = min(minDistance, length(r));
            }
            return minDistance;
          }
          #endif
        `,
      );

      shader.fragmentShader = injectBefore(
        shader.fragmentShader,
        "#include <output_fragment>",
        /* glsl */ `
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

          vec2 uv = vUv;
          float s = clamp(0.35 + 0.35 * sin(5.0 * -time + vUv.y * 600.0), 0.0, 1.0);
          float scanLines = pow(s, 1.33);

          outgoingLight *= diffuseRandomColor;

          #ifdef showPattern
          float val = pow(voronoi(uv * 8.0) * 1.2, 0.5);
          float thickness = 1.0 / 500.0;
          vec2 g = step(mod(uv, 0.015), vec2(thickness));
          float a = 1.0 - clamp(val * (g.x + g.y), 0.0, 1.0);
          vec3 grid = vec3(smoothstep(0.01, 0.0, a) * 1.15) * diffuseRandomColor;
          outgoingLight += grid;
          #endif

          outgoingLight += smoothstep(0.1, 0.0, scanLines) * 0.1;
        `,
      );
    };

    this.generateColorCube();
  }

  private generateColorCube() {
    const saturation = 0.4;
    const lightness = 0.7;
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
    this.transmission = characterValues.transmission;
    this.metalness = characterValues.metalness;
    this.roughness = characterValues.roughness;
    this.ior = characterValues.ior;
    this.thickness = characterValues.thickness;
    this.specularColor = new Color().setRGB(
      characterValues.specularColor.r,
      characterValues.specularColor.g,
      characterValues.specularColor.b,
    );
    this.specularIntensity = characterValues.specularIntensity;
    this.emissive = new Color().setRGB(
      characterValues.emissive.r,
      characterValues.emissive.g,
      characterValues.emissive.b,
    );
    this.emissiveIntensity = characterValues.emissiveIntensity;
    this.envMapIntensity = characterValues.envMapIntensity;
    this.sheenColor = new Color().setRGB(
      characterValues.sheenColor.r,
      characterValues.sheenColor.g,
      characterValues.sheenColor.b,
    );
    this.sheen = characterValues.sheen;
    this.clearcoat = characterValues.clearcoat;
    this.clearcoatRoughness = characterValues.clearcoatRoughness;
  }
}
