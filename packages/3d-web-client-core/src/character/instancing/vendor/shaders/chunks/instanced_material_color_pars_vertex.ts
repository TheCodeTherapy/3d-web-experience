export const instanced_material_color_pars_vertex = /* glsl */ `
#ifdef USE_INSTANCING_MATERIAL_COLORS
  uniform highp sampler2D materialColorsTexture;

  // material indices for the LUT
  #define MATERIAL_HAIR 0
  #define MATERIAL_SHIRT_SHORT 1
  #define MATERIAL_SHIRT_LONG 2
  #define MATERIAL_PANTS_SHORT 3
  #define MATERIAL_PANTS_LONG 4
  #define MATERIAL_SHOES 5
  #define MATERIAL_SKIN 6
  #define MATERIAL_LIPS 7

  vec3 getMaterialColorTexture(int materialIndex) {
    int size = textureSize(materialColorsTexture, 0).x;
    int instanceId = int(instanceIndex);
    int colorIndex = instanceId * 8 + materialIndex;
    int x = colorIndex % size;
    int y = colorIndex / size;
    return texelFetch(materialColorsTexture, ivec2(x, y), 0).rgb;
  }
#endif
`;
