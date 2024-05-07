import { ShaderMaterial, Uniform, Vector2 } from "three";

import { vertexShader } from "../shaders/vertex-shader";

export const GaussGrainEffect = new ShaderMaterial({
  uniforms: {
    tDiffuse: new Uniform(null),
    resolution: new Uniform(new Vector2()),
    time: new Uniform(0.0),
    amount: new Uniform(0.0),
    alpha: new Uniform(0.0),
  },
  vertexShader: vertexShader,
  fragmentShader: /* glsl */ `
    precision highp float;
    in vec2 vUv;

    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time;
    uniform float amount;
    uniform float alpha;

    const float PI = acos(-1.0);
    const float TAU = PI * 2.0;
    const float SQRTAU = sqrt(TAU);

    float gaussian(float z, float u, float o) {
      return (
        (1.0 / (o * SQRTAU)) *
        (exp(-(((z - u) * (z - u)) / (2.0 * (o * o)))))
      );
    }

    vec3 gaussgrain() {
      vec2 ps = vec2(1.0) / resolution.xy;
      vec2 uv = gl_FragCoord.xy * ps;
      float t = time;
      float seed = dot(uv, vec2(12.9898, 78.233));
      float noise = fract(sin(seed) * 43758.5453123 + t);
      noise = gaussian(noise, 0.0, 0.5);
      return vec3(noise);
    }

    void main(void) {
      vec2 uv = vUv;
      vec4 originalColor = texture(tDiffuse, uv);
      vec3 grain = gaussgrain();
      vec3 col = originalColor.rgb + (grain * amount);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), alpha);
    }
  `,
  dithering: true,
});
