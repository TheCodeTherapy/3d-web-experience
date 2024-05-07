// Original code from: https://github.com/N8python/n8ao
// ported to TypeScript

import { Matrix4, Uniform, Vector2, Vector3 } from "three";

const EffectShader = {
  uniforms: {
    sceneDiffuse: new Uniform(null),
    sceneDepth: new Uniform(null),
    sceneNormal: new Uniform(null),
    projMat: new Uniform(new Matrix4()),
    viewMat: new Uniform(new Matrix4()),
    projViewMat: new Uniform(new Matrix4()),
    projectionMatrixInv: new Uniform(new Matrix4()),
    viewMatrixInv: new Uniform(new Matrix4()),
    cameraPos: new Uniform(new Vector3()),
    resolution: new Uniform(new Vector2()),
    time: new Uniform(0.0),
    samples: new Uniform([]),
    samplesR: new Uniform([]),
    bluenoise: new Uniform(null),
    distanceFalloff: new Uniform(1.0),
    radius: new Uniform(5.0),
    near: new Uniform(0.1),
    far: new Uniform(1000.0),
    logDepth: new Uniform(false),
    ortho: new Uniform(false),
    screenSpaceRadius: new Uniform(false),
  },

  depthWrite: false,

  depthTest: false,

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(void) {
      vUv = uv;
      gl_Position = vec4(position, 1);
    }
  `,

  fragmentShader: /* glsl */ `
    #define SAMPLES 16
    #define FSAMPLES 16.0
    uniform sampler2D sceneDiffuse;
    uniform highp sampler2D sceneNormal;
    uniform highp sampler2D sceneDepth;
    uniform mat4 projectionMatrixInv;
    uniform mat4 viewMatrixInv;
    uniform mat4 projMat;
    uniform mat4 viewMat;
    uniform mat4 projViewMat;
    uniform vec3 cameraPos;
    uniform vec2 resolution;
    uniform float time;
    uniform vec3[SAMPLES] samples;
    uniform float[SAMPLES] samplesR;
    uniform float radius;
    uniform float distanceFalloff;
    uniform float near;
    uniform float far;
    uniform bool logDepth;
    uniform bool ortho;
    uniform bool screenSpaceRadius;
    uniform sampler2D bluenoise;
    varying vec2 vUv;

    highp float linearize_depth(highp float d, highp float zNear,highp float zFar) {
      return (zFar * zNear) / (zFar - d * (zFar - zNear));
    }

    highp float linearize_depth_ortho(highp float d, highp float nearZ, highp float farZ) {
      return nearZ + (farZ - nearZ) * d;
    }

    highp float linearize_depth_log(highp float d, highp float nearZ,highp float farZ) {
      float depth = pow(2.0, d * log2(farZ + 1.0)) - 1.0;
      float a = farZ / (farZ - nearZ);
      float b = farZ * nearZ / (nearZ - farZ);
      float linDepth = a + b / depth;
      return (
        ortho
          ? linearize_depth_ortho(linDepth, nearZ, farZ)
          : linearize_depth(linDepth, nearZ, farZ)
      );
    }

    vec3 getWorldPosLog(vec3 posS) {
      vec2 uv = posS.xy;
      float z = posS.z;
      float nearZ =near;
      float farZ = far;
      float depth = pow(2.0, z * log2(farZ + 1.0)) - 1.0;
      float a = farZ / (farZ - nearZ);
      float b = farZ * nearZ / (nearZ - farZ);
      float linDepth = a + b / depth;
      vec4 clipVec = vec4(uv, linDepth, 1.0) * 2.0 - 1.0;
      vec4 wpos = projectionMatrixInv * clipVec;
      return wpos.xyz / wpos.w;
    }

    vec3 getWorldPos(float depth, vec2 coord) {
      #ifdef LOGDEPTH
        return getWorldPosLog(vec3(coord, depth));
      #endif
      float z = depth * 2.0 - 1.0;
      vec4 clipSpacePosition = vec4(coord * 2.0 - 1.0, z, 1.0);
      vec4 viewSpacePosition = projectionMatrixInv * clipSpacePosition;

      vec4 worldSpacePosition = viewSpacePosition;
      worldSpacePosition.xyz /= worldSpacePosition.w;
      return worldSpacePosition.xyz;
    }

    vec3 computeNormal(vec3 worldPos, vec2 vUv) {
      ivec2 p = ivec2(vUv * resolution);
      float c0 = texelFetch(sceneDepth, p, 0).x;
      float l2 = texelFetch(sceneDepth, p - ivec2(2, 0), 0).x;
      float l1 = texelFetch(sceneDepth, p - ivec2(1, 0), 0).x;
      float r1 = texelFetch(sceneDepth, p + ivec2(1, 0), 0).x;
      float r2 = texelFetch(sceneDepth, p + ivec2(2, 0), 0).x;
      float b2 = texelFetch(sceneDepth, p - ivec2(0, 2), 0).x;
      float b1 = texelFetch(sceneDepth, p - ivec2(0, 1), 0).x;
      float t1 = texelFetch(sceneDepth, p + ivec2(0, 1), 0).x;
      float t2 = texelFetch(sceneDepth, p + ivec2(0, 2), 0).x;
      float dl = abs((2.0 * l1 - l2) - c0);
      float dr = abs((2.0 * r1 - r2) - c0);
      float db = abs((2.0 * b1 - b2) - c0);
      float dt = abs((2.0 * t1 - t2) - c0);
      vec3 ce = getWorldPos(c0, vUv).xyz;
      vec3 dpdx = (
        (dl < dr)
          ? ce - getWorldPos(l1, (vUv - vec2(1.0 / resolution.x, 0.0))).xyz
          : -ce + getWorldPos(r1, (vUv + vec2(1.0 / resolution.x, 0.0))).xyz
      );
      vec3 dpdy = (
        (db < dt)
          ? ce - getWorldPos(b1, (vUv - vec2(0.0, 1.0 / resolution.y))).xyz
          : -ce + getWorldPos(t1, (vUv + vec2(0.0, 1.0 / resolution.y))).xyz
      );
      return normalize(cross(dpdx, dpdy));
    }

    void main(void) {
      vec4 diffuse = texture2D(sceneDiffuse, vUv);
      float depth = texture2D(sceneDepth, vUv).x;

      if (depth == 1.0) {
        gl_FragColor = vec4(vec3(1.0), 1.0);
        return;
      }

      vec3 worldPos = getWorldPos(depth, vUv);

      #ifdef HALFRES
        vec3 normal = texture2D(sceneNormal, vUv).rgb;
      #else
        vec3 normal = computeNormal(worldPos, vUv);
      #endif

      vec4 noise = texture2D(bluenoise, gl_FragCoord.xy / 128.0);
      vec3 randomVec = normalize(noise.rgb * 2.0 - 1.0);
      vec3 tangent = normalize(randomVec - normal * dot(randomVec, normal));
      vec3 bitangent = cross(normal, tangent);
      mat3 tbn = mat3(tangent, bitangent, normal);
      float occluded = 0.0;
      float totalWeight = 0.0;

      float radiusToUse = (
      screenSpaceRadius
        ? distance(worldPos, getWorldPos(depth, vUv + vec2(radius, 0.0) / resolution))
        : radius
      );
      float distanceFalloffToUse = (
        screenSpaceRadius
          ? radiusToUse * distanceFalloff
          : distanceFalloff
      );
      float bias = (0.1 / near) * fwidth(distance(worldPos, cameraPos)) / radiusToUse;
      for(float i = 0.0; i < FSAMPLES; i++) {
        vec3 sampleDirection = tbn * samples[int(i)];
        float moveAmt = samplesR[int(mod(i + noise.a * FSAMPLES, FSAMPLES))];
        vec3 samplePos = worldPos + radiusToUse * moveAmt * sampleDirection;
        vec4 offset = projMat * vec4(samplePos, 1.0);
        offset.xyz /= offset.w;
        offset.xyz = offset.xyz * 0.5 + 0.5;
        float sampleDepth = textureLod(sceneDepth, offset.xy, 0.0).x;
        #ifdef LOGDEPTH
          float distSample = linearize_depth_log(sampleDepth, near, far);
        #else
          float distSample = (
            ortho
              ? linearize_depth_ortho(sampleDepth, near, far)
              : linearize_depth(sampleDepth, near, far)
          );
        #endif
        float distWorld = (
          ortho
            ? linearize_depth_ortho(offset.z, near, far)
            : linearize_depth(offset.z, near, far)
        );
        float rangeCheck = smoothstep(0.0, 1.0, distanceFalloffToUse / (abs(distSample - distWorld)));
        vec2 diff = gl_FragCoord.xy - ( offset.xy * resolution);
        float weight = dot(sampleDirection, normal);
        occluded += rangeCheck * weight *
          (distSample + bias < distWorld ? 1.0 : 0.0) *
          (
            (
              dot(diff, diff) < 1.0 ||
              (sampleDepth == depth) ||
              (offset.x < 0.0 || offset.x > 1.0 || offset.y < 0.0 || offset.y > 1.0) ? 0.0 : 1.0
            )
          );
        totalWeight += weight;
      }
      float occ = clamp(1.0 - occluded / totalWeight, 0.0, 1.0);
      gl_FragColor = vec4(0.5 + 0.5 * normal, occ);
    }`,
};

export { EffectShader };
