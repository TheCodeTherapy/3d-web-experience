export const leafFragmentShader = /* glsl */ `
varying vec2 vUv;

#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
#include <dithering_pars_fragment>

void main(void) {
  vec3 baseColor = vec3(0.31, 0.9, 0.4);
  float clarity = (vUv.y * 0.5) + 0.12;
  vec3 finalColor = baseColor * clarity;
  vec3 shadowColor = vec3(0.0, 0.0, 0.0);
  float shadowPower = 0.85;
  gl_FragColor = vec4(mix(finalColor, shadowColor, (1.0 - getShadowMask()) * shadowPower), 1.0);
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;
