export const simplexNoiseChunk = /* glsl */ `

float N (vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float smoothNoise (vec2 ip) {
  vec2 lv = fract(ip);
  vec2 id = floor(ip);
  lv = lv * lv * (3.0 - 2.0 * lv);
  float bl = N(id);
  float br = N(id + vec2(1.0, 0.0));
  float b = mix(bl, br, lv.x);
  float tl = N(id + vec2(0.0, 1.0));
  float tr = N(id + vec2(1.0, 1.0));
  float t = mix(tl, tr, lv.x);
  return mix(b, t, lv.y);
}
`;
