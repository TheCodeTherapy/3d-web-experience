// Core instancing classes
export * from "./core/InstancedEntity";
export * from "./core/InstancedMesh2";
export * from "./core/InstancedMeshBVH";

// Feature modules (note: these extend InstancedMesh2 prototype, no direct exports)
import "./core/feature/Capacity";
import "./core/feature/FrustumCulling";
import "./core/feature/LOD";
import "./core/feature/Morph";
import "./core/feature/Raycasting";
import "./core/feature/Skeleton";
import "./core/feature/Uniforms";

// Export types from Instances feature
export type { Entity, UpdateEntityCallback } from "./core/feature/Instances";
import "./core/feature/Instances";

// Utility classes
export * from "./core/utils/GLInstancedBufferAttribute";
export * from "./core/utils/InstancedRenderList";
export * from "./core/utils/SquareDataTexture";

// Shader chunks and helpers
export * from "./shaders/ShaderChunk";
export * from "./shaders/chunks/instanced_pars_vertex";
export * from "./shaders/chunks/instanced_color_pars_vertex";
export * from "./shaders/chunks/instanced_color_vertex";
export * from "./shaders/chunks/instanced_material_color_pars_vertex";
export * from "./shaders/chunks/instanced_material_color_vertex";
export * from "./shaders/chunks/instanced_vertex";
export * from "./shaders/chunks/instanced_skinning_pars_vertex";

// Utils
export * from "./utils/SortingUtils";
export * from "./utils/CreateFrom";
