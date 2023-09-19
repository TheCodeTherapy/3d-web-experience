import { ShaderMaterial, Uniform } from "three";

import { vertexShader } from "../shaders/vertex-shader";

export const BrightnessContrastSaturation = new ShaderMaterial({
  uniforms: {
    tDiffuse: new Uniform(null),
    brightness: new Uniform(0.0),
    contrast: new Uniform(1.0),
    saturation: new Uniform(1.0),
  },
  vertexShader: vertexShader,
  fragmentShader: /* glsl */ `
    precision highp float;
    in vec2 vUv;

    uniform sampler2D tDiffuse;
    uniform float brightness;
    uniform float contrast;
    uniform float saturation;

    mat4 brightnessMatrix(float brightness) {
      return mat4(
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        brightness, brightness, brightness, 1
      );
    }

    mat4 contrastMatrix(float contrast) {
      float t = (1.0 - contrast) / 2.0;

      return mat4(
        contrast, 0, 0, 0,
        0, contrast, 0, 0,
        0, 0, contrast, 0,
        t, t, t, 1
      );
    }

    mat4 saturationMatrix(float saturation) {
      vec3 luminance = vec3(0.3086, 0.6094, 0.0820);
      float oneMinusSat = 1.0 - saturation;
      vec3 red = vec3(luminance.x * oneMinusSat);
      red += vec3(saturation, 0, 0);
      vec3 green = vec3(luminance.y * oneMinusSat);
      green += vec3(0, saturation, 0);
      vec3 blue = vec3(luminance.z * oneMinusSat);
      blue += vec3(0, 0, saturation);
      return mat4(
        red, 0,
        green, 0,
        blue, 0,
        0, 0, 0, 1
      );
    }

    void main(void) {
      vec4 color = texture(tDiffuse, vUv);
      gl_FragColor = (
        brightnessMatrix(brightness) *
        contrastMatrix(contrast) *
        saturationMatrix(saturation) *
        color
      );
    }
  `,
  dithering: true,
});
