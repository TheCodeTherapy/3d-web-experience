import { simplexNoiseChunk } from "./simplex-noise-chunk";

export const leafVertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>

varying vec2 vUv;
uniform float time;
uniform float windForce;
uniform float windSpeed;
uniform bool enableBillboarding;

${simplexNoiseChunk}

const float ATHIRD = 1.0 / 3.0;
const float THIRDPI = PI * ATHIRD;

void main(void) {
  #include <begin_vertex>
  #include <beginnormal_vertex>
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <defaultnormal_vertex>
  #include <shadowmap_vertex>
  #include <fog_vertex>

  vUv = uv;

  // Compute world position of the instance
  vec4 instancePosition = vec4(0.0, 0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
    instancePosition = instanceMatrix * instancePosition;
  #endif

  vec3 rotatedVertex = position;

  if (enableBillboarding) {
    // Compute the direction vector to the camera on XZ plane
    vec3 toCamera = normalize(vec3(cameraPosition.x, 0.0, cameraPosition.z) - vec3(instancePosition.x, 0.0, instancePosition.z));

    // Compute rotation angle around Y-axis
    float angle = atan(toCamera.x, toCamera.z);

    // Rotate the vertex around its local Y-axis
    mat3 rotationMatrix = mat3(
      cos(angle), 0.0, -sin(angle),
      0.0,        1.0,  0.0,
      sin(angle), 0.0,  cos(angle)
    );

    // Rotate the leaf mesh locally
    rotatedVertex = rotationMatrix * position;
  }

  // Compute final world position
  worldPosition = vec4(rotatedVertex, 1.0);
  #ifdef USE_INSTANCING
    worldPosition = instanceMatrix * worldPosition;
  #endif

  // apply wind animation after billboard rotation
  float t = time * windSpeed;
  float noise = smoothNoise(worldPosition.xz * 0.25 + vec2(0.0, t));

  // quadratic curve
  float bendAmount = vUv.y * vUv.y;
  float windStrength = windForce * 0.05;
  
  // apply horizontal displacement for bending (X and Z directions)
  vec2 windDirection = vec2(cos(noise * PI * 2.0), sin(noise * PI * 2.0));
  worldPosition.x += windDirection.x * bendAmount * windStrength * noise;
  worldPosition.z += windDirection.y * bendAmount * windStrength * noise;
  
  // slight vertical compression when bending heavily
  float bendCompressionFactor = 1.0 - (bendAmount * abs(noise) * 0.25);
  worldPosition.y *= bendCompressionFactor;

  // final transformation to camera space
  vec4 modelViewPosition = modelViewMatrix * worldPosition;
  gl_Position = projectionMatrix * modelViewPosition;
}
`;
