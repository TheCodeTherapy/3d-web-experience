import { ShaderMaterial, Uniform, Vector2 } from "three";

import { vertexShader } from "../shaders/vertex-shader";

export const DenoiseEffect = new ShaderMaterial({
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
    const float goldenAngle = 3.0 * PI - sqrt(5.0) * PI;
    const float pixelMultiplier = 1.5;
    const float inverseHUETolerance = 20.0;
    const int samples = 32;
    const float distBias = 0.6;

    #define pow(a,b) pow(max(a,0.0), b)

    mat2 rotate = mat2(
      cos(goldenAngle),
      sin(goldenAngle),
      -sin(goldenAngle),
      cos(goldenAngle)
    );

    vec3 denoise(in sampler2D tex, in vec2 uv, in vec2 res) {
      vec3 denoised = vec3(0.0);
      const float sampleRadius = sqrt(float(samples));
      const float sampleTrueRadius = 0.5 / (sampleRadius * sampleRadius);
      vec2 samplePixel = vec2(1.0 / res.x, 1.0 / res.y);
      vec3 sampleCenter = texture(tex, uv).rgb;
      vec3 sampleCenterNorm = normalize(sampleCenter);
      float sampleCenterSat = length(sampleCenter);
      float influenceSum = 0.0;
      float brightnessSum = 0.0;
      vec2 pixelRotated = vec2(0.0, 1.0);

      for (float x = 0.0; x <= float(samples); x++) {
        pixelRotated *= rotate;
        vec2 offset = pixelMultiplier * pixelRotated * sqrt(x) * 0.5;
        float influence = 1.0 - sampleTrueRadius * pow(dot(offset, offset), distBias);
        offset *= samplePixel;
        vec3 denoisedCol = texture(tex, uv + offset).rgb;
        influence *= influence * influence;
        influence *= (
          pow(0.5 + 0.5 * dot(sampleCenterNorm, normalize(denoisedCol)), inverseHUETolerance) *
          pow(1.0 - abs(length(denoisedCol) - length(sampleCenterSat)), 8.0)
        );
        influenceSum += influence;
        denoised += denoisedCol * influence;
      }
      return denoised / influenceSum;
    }

    void main(void) {
      vec2 uv = vUv;
      vec3 col = texture(tDiffuse, uv).rgb;
      vec3 denoisedCol = denoise(tDiffuse, uv, vec2(512, 512)).rgb;
      gl_FragColor = vec4(mix(col, denoisedCol, amount), 1.0);
    }
  `,
  dithering: true,
});
