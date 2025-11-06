import { ShaderChunk } from "three";

import { instanced_color_pars_vertex } from "./chunks/instanced_color_pars_vertex";
import { instanced_color_vertex } from "./chunks/instanced_color_vertex";
import { instanced_material_color_pars_vertex } from "./chunks/instanced_material_color_pars_vertex";
import { instanced_material_color_vertex } from "./chunks/instanced_material_color_vertex";
import { instanced_pars_vertex } from "./chunks/instanced_pars_vertex";
import { instanced_skinning_pars_vertex } from "./chunks/instanced_skinning_pars_vertex";
import { instanced_vertex } from "./chunks/instanced_vertex";

(ShaderChunk as any)["instanced_pars_vertex"] = instanced_pars_vertex;
(ShaderChunk as any)["instanced_color_pars_vertex"] = instanced_color_pars_vertex;
(ShaderChunk as any)["instanced_vertex"] = instanced_vertex;
(ShaderChunk as any)["instanced_color_vertex"] = instanced_color_vertex;
(ShaderChunk as any)["instanced_material_color_pars_vertex"] = instanced_material_color_pars_vertex;
(ShaderChunk as any)["instanced_material_color_vertex"] = instanced_material_color_vertex;

export function patchShader(shader: string): string {
  return shader.replace(
    "#ifdef USE_INSTANCING",
    "#if defined USE_INSTANCING || defined USE_INSTANCING_INDIRECT",
  );
}

ShaderChunk.project_vertex = patchShader(ShaderChunk.project_vertex);
ShaderChunk.worldpos_vertex = patchShader(ShaderChunk.worldpos_vertex);
ShaderChunk.defaultnormal_vertex = patchShader(ShaderChunk.defaultnormal_vertex);

ShaderChunk.batching_pars_vertex = ShaderChunk.batching_pars_vertex.concat(
  "\n#include <instanced_pars_vertex>",
);
ShaderChunk.color_pars_vertex = ShaderChunk.color_pars_vertex.concat(
  "\n#include <instanced_color_pars_vertex>",
  "\n#include <instanced_material_color_pars_vertex>",
);
(ShaderChunk as any)["batching_vertex"] = (ShaderChunk as any)["batching_vertex"].concat(
  "\n#include <instanced_vertex>",
);

ShaderChunk.skinning_pars_vertex = instanced_skinning_pars_vertex;

if ((ShaderChunk as any)["morphinstance_vertex"]) {
  (ShaderChunk as any)["morphinstance_vertex"] = (ShaderChunk as any)[
    "morphinstance_vertex"
  ].replaceAll("gl_InstanceID", "instanceIndex");
}
