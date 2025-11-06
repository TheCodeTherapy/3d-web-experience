export const instanced_material_color_vertex = /* glsl */ `
#ifdef USE_INSTANCING_MATERIAL_COLORS
  #ifdef USE_VERTEX_COLOR
    vec3 vertexColor = color;
    vec3 instanceColor = vec3(1.0);
    
    if (vertexColor.r == 0.0 && vertexColor.g == 0.0 && vertexColor.b == 0.0) {
      // Hair material (0, 0, 0)
      instanceColor = getMaterialColorTexture(MATERIAL_HAIR);
    } else if (vertexColor.r == 0.0 && vertexColor.g == 0.0 && vertexColor.b == 1.0) {
      // Shirt short material (0, 0, 1)
      instanceColor = getMaterialColorTexture(MATERIAL_SHIRT_SHORT);
    } else if (vertexColor.r == 0.0 && vertexColor.g == 1.0 && vertexColor.b == 0.0) {
      // Shirt long material (0, 1, 0)
      instanceColor = getMaterialColorTexture(MATERIAL_SHIRT_LONG);
    } else if (vertexColor.r == 0.0 && vertexColor.g == 1.0 && vertexColor.b == 1.0) {
      // Pants short material (0, 1, 1)
      instanceColor = getMaterialColorTexture(MATERIAL_PANTS_SHORT);
    } else if (vertexColor.r == 1.0 && vertexColor.g == 0.0 && vertexColor.b == 0.0) {
      // Pants long material (1, 0, 0)
      instanceColor = getMaterialColorTexture(MATERIAL_PANTS_LONG);
    } else if (vertexColor.r == 1.0 && vertexColor.g == 0.0 && vertexColor.b == 1.0) {
      // Shoes material (1, 0, 1)
      instanceColor = getMaterialColorTexture(MATERIAL_SHOES);
    } else if (vertexColor.r == 1.0 && vertexColor.g == 1.0 && vertexColor.b == 0.0) {
      // Skin material (1, 1, 0)
      instanceColor = getMaterialColorTexture(MATERIAL_SKIN);
    } else if (vertexColor.r == 1.0 && vertexColor.g == 1.0 && vertexColor.b == 1.0) {
      // Lips material (1, 1, 1)
      instanceColor = getMaterialColorTexture(MATERIAL_LIPS);
    } else if (vertexColor.r == 0.5 && vertexColor.g == 0.0 && vertexColor.b == 0.0) {
      // Eyes black material (0.5, 0, 0)
      instanceColor = getMaterialColorTexture(MATERIAL_SKIN); // Using skin index for now
    } else if (vertexColor.r == 0.0 && vertexColor.g == 0.5 && vertexColor.b == 0.0) {
      // Eyes white material (0, 0.5, 0)
      instanceColor = getMaterialColorTexture(MATERIAL_SKIN); // Using skin index for now
    }
    
    vColor = instanceColor;
  #else
    vColor = vec3(1.0);
  #endif
#endif
`;
