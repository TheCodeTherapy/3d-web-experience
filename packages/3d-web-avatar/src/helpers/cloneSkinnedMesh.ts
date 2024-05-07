import { Group } from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

export function cloneSkinnedMesh(model: Group) {
  return SkeletonUtils.clone(model);
}
