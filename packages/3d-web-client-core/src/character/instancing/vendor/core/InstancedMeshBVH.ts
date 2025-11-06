import { Box3, Matrix4, Raycaster, Sphere, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

import { LODLevel } from "./feature/LOD";
import { InstancedMesh2 } from "./InstancedMesh2";

// Type definitions for callback functions (simplified for three-mesh-bvh)
export type onFrustumIntersectionCallback<T, U> = (nodeIndex: number) => void;
export type onFrustumIntersectionLODCallback<T, U> = (nodeIndex: number, level: number) => void;
export type onIntersectionCallback<T> = (nodeIndex: number) => void;
export type onIntersectionRayCallback<T> = (nodeIndex: number) => void;

// Helper functions (adapted from bvh.js)
function box3ToArray(box: Box3, array: Float32Array): Float32Array {
  array[0] = box.min.x;
  array[1] = box.max.x;
  array[2] = box.min.y;
  array[3] = box.max.y;
  array[4] = box.min.z;
  array[5] = box.max.z;
  return array;
}

function vec3ToArray(vec: Vector3, array: Float32Array): Float32Array {
  array[0] = vec.x;
  array[1] = vec.y;
  array[2] = vec.z;
  return array;
}

// TODO getBoxFromSphere updated if change geometry (and create accessor)
// TODO accurateCulling in bvh.js?
// TODO use params in constructor
// TODO: intersectBox optional intersectCallback

/**
 * Parameters for configuring the BVH (Bounding Volume Hierarchy).
 */
export interface BVHParams {
  /**
   * Margin applied to accommodate animated or moving objects.
   * Improves BVH update performance but slows down frustum culling and raycasting.
   * For static objects, set to 0 to optimize culling and raycasting efficiency.
   * @default 0
   */
  margin?: number;
  /**
   * Uses the geometry bounding sphere to compute instance bounding boxes.
   * Otherwise it's calculated by applying the object's matrix to all 8 bounding box points.
   * This is faster but less precise. Useful for moving objects.
   * Only works if the geometry's bounding sphere is centered at the origin.
   * @default false
   */
  getBBoxFromBSphere?: boolean;
  /**
   * Enables accurate frustum culling by checking intersections without applying margin to the bounding box.
   * @default true
   */
  accurateCulling?: boolean;
}

interface SphereTarget {
  centerX: number;
  centerY: number;
  centerZ: number;
  maxScale: number;
}

/**
 * Class to manage BVH (Bounding Volume Hierarchy) for `InstancedMesh2`.
 * Provides methods for managing bounding volumes, frustum culling, raycasting, and bounding box computation.
 */
export class InstancedMeshBVH {
  /**
   * The target `InstancedMesh2` object that the BVH is managing.
   */
  public target: InstancedMesh2;
  /**
   * The geometry bounding box of the target.
   */
  public geoBoundingBox: Box3;
  /**
   * The BVH instance used to organize bounding volumes.
   */
  public bvh: MeshBVH | null = null;
  /**
   * A map that stores the BVH nodes for each instance.
   */
  public nodesMap = new Map<number, any>();
  /**
   * Enables accurate frustum culling by checking intersections without applying margin to the bounding box.
   */
  public accurateCulling: boolean;
  protected LODsMap = new Map<LODLevel[], Float32Array>();
  protected _margin: number;
  protected _origin: Float32Array;
  protected _dir: Float32Array;
  protected _boxArray: Float32Array | null = null;
  protected _cameraPos: Float32Array;
  protected _getBoxFromSphere: boolean;
  protected _geoBoundingSphere: Sphere | null = null;
  protected _sphereTarget: SphereTarget | null = null;

  /**
   * @param target The target `InstancedMesh2`.
   * @param margin The margin applied for bounding box calculations (default is 0).
   * @param getBBoxFromBSphere Flag to determine if instance bounding boxes should be computed from the geometry bounding sphere. Faster but less precise (default is false).
   * @param accurateCulling Flag to enable accurate frustum culling without considering margin (default is true).
   */
  constructor(
    target: InstancedMesh2,
    margin = 0,
    getBBoxFromBSphere = false,
    accurateCulling = true,
  ) {
    this.target = target;
    this.accurateCulling = accurateCulling;
    this._margin = margin;

    const geometry = target._geometry;

    if (!geometry.boundingBox) geometry.computeBoundingBox();
    this.geoBoundingBox = geometry.boundingBox!;

    if (getBBoxFromBSphere) {
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();

      const center = geometry.boundingSphere!.center;
      if (center.x === 0 && center.y === 0 && center.z === 0) {
        this._geoBoundingSphere = geometry.boundingSphere!;
        this._sphereTarget = { centerX: 0, centerY: 0, centerZ: 0, maxScale: 0 };
      } else {
        console.warn('"getBoxFromSphere" is ignored because geometry is not centered.');
        getBBoxFromBSphere = false;
      }
    }

    // Note: three-mesh-bvh works differently - we'll create a simplified implementation
    this.bvh = null; // Will be created when needed
    this._origin = new Float32Array(3);
    this._dir = new Float32Array(3);
    this._cameraPos = new Float32Array(3);
    this._getBoxFromSphere = getBBoxFromBSphere;
  }

  /**
   * Builds the BVH from the target mesh's instances using a top-down construction method.
   * This approach is more efficient and accurate compared to incremental methods, which add one instance at a time.
   * Note: Simplified implementation for three-mesh-bvh compatibility
   */
  public create(): void {
    // TODO: Implement proper three-mesh-bvh integration
    this.clear();
    console.warn("BVH create() - simplified implementation, full BVH functionality disabled");
  }

  /**
   * Inserts an instance into the BVH.
   * @param id The id of the instance to insert.
   */
  public insert(id: number): void {
    // TODO: Implement proper three-mesh-bvh integration
    console.warn("BVH insert() - simplified implementation, full BVH functionality disabled");
  }

  /**
   * Inserts a range of instances into the BVH.
   * @param ids An array of ids to insert.
   */
  public insertRange(ids: number[]): void {
    // TODO: Implement proper three-mesh-bvh integration
    console.warn("BVH insertRange() - simplified implementation, full BVH functionality disabled");
  }

  /**
   * Moves an instance within the BVH.
   * @param id The id of the instance to move.
   */
  public move(id: number): void {
    // TODO: Implement proper three-mesh-bvh integration
    // For now, do nothing - this is called from setMatrixAt
  }

  /**
   * Deletes an instance from the BVH.
   * @param id The id of the instance to delete.
   */
  public delete(id: number): void {
    // TODO: Implement proper three-mesh-bvh integration
    this.nodesMap.delete(id);
  }

  /**
   * Clears the BVH.
   */
  public clear(): void {
    this.bvh = null;
    this.nodesMap.clear();
  }

  /**
   * Performs frustum culling to determine which instances are visible based on the provided projection matrix.
   * @param projScreenMatrix The projection screen matrix for frustum culling.
   * @param onFrustumIntersection Callback function invoked when an instance intersects the frustum.
   * Note: Simplified implementation - BVH frustum culling disabled
   */
  public frustumCulling(
    projScreenMatrix: Matrix4,
    onFrustumIntersection: onFrustumIntersectionCallback<object, number>,
  ): void {
    // TODO: Implement proper three-mesh-bvh frustum culling
    console.warn(
      "BVH frustumCulling() - simplified implementation, full BVH functionality disabled",
    );

    // Fallback: call callback for all active instances (no culling)
    const instancesArrayCount = this.target._instancesArrayCount;
    for (let i = 0; i < instancesArrayCount; i++) {
      if (this.target.getActiveAt(i)) {
        onFrustumIntersection(i);
      }
    }
  }

  /**
   * Performs frustum culling with Level of Detail (LOD) consideration.
   * @param projScreenMatrix The projection screen matrix for frustum culling.
   * @param cameraPosition The camera's position used for LOD calculations.
   * @param levels An array of LOD levels.
   * @param onFrustumIntersection Callback function invoked when an instance intersects the frustum.
   * Note: Simplified implementation - BVH LOD culling disabled
   */
  public frustumCullingLOD(
    projScreenMatrix: Matrix4,
    cameraPosition: Vector3,
    levels: LODLevel[],
    onFrustumIntersection: onFrustumIntersectionLODCallback<object, number>,
  ): void {
    // TODO: Implement proper three-mesh-bvh LOD frustum culling
    console.warn(
      "BVH frustumCullingLOD() - simplified implementation, full BVH functionality disabled",
    );

    // Fallback: call callback for all active instances with level 0
    const instancesArrayCount = this.target._instancesArrayCount;
    for (let i = 0; i < instancesArrayCount; i++) {
      if (this.target.getActiveAt(i)) {
        onFrustumIntersection(i, 0);
      }
    }
  }

  /**
   * Performs raycasting to check if a ray intersects any instances.
   * @param raycaster The raycaster used for raycasting.
   * @param onIntersection Callback function invoked when a ray intersects an instance.
   * Note: Simplified implementation - BVH raycasting disabled
   */
  public raycast(raycaster: Raycaster, onIntersection: onIntersectionRayCallback<number>): void {
    // TODO: Implement proper three-mesh-bvh raycasting
    console.warn("BVH raycast() - simplified implementation, full BVH functionality disabled");
  }

  /**
   * Checks if a given box intersects with any instance bounding box.
   * @param target The target bounding box.
   * @param onIntersection Callback function invoked when an intersection occurs.
   * @returns `True` if there is an intersection, otherwise `false`.
   * Note: Simplified implementation - BVH box intersection disabled
   */
  public intersectBox(target: Box3, onIntersection: onIntersectionCallback<number>): boolean {
    // TODO: Implement proper three-mesh-bvh box intersection
    console.warn("BVH intersectBox() - simplified implementation, full BVH functionality disabled");
    return false;
  }

  protected getBox(id: number, array: Float32Array): Float32Array {
    if (this._getBoxFromSphere) {
      const matrixArray = this.target.matricesTexture._data as Float32Array;
      const { centerX, centerY, centerZ, maxScale } = this.getSphereFromMatrix_centeredGeometry(
        id,
        matrixArray,
        this._sphereTarget!,
      );
      const radius = this._geoBoundingSphere!.radius * maxScale;
      array[0] = centerX - radius;
      array[1] = centerX + radius;
      array[2] = centerY - radius;
      array[3] = centerY + radius;
      array[4] = centerZ - radius;
      array[5] = centerZ + radius;
    } else {
      _box3.copy(this.geoBoundingBox).applyMatrix4(this.target.getMatrixAt(id));
      box3ToArray(_box3, array);
    }

    return array;
  }

  protected getSphereFromMatrix_centeredGeometry(
    id: number,
    array: Float32Array,
    target: SphereTarget,
  ): SphereTarget {
    const offset = id * 16;

    const m0 = array[offset + 0];
    const m1 = array[offset + 1];
    const m2 = array[offset + 2];
    const m4 = array[offset + 4];
    const m5 = array[offset + 5];
    const m6 = array[offset + 6];
    const m8 = array[offset + 8];
    const m9 = array[offset + 9];
    const m10 = array[offset + 10];

    const scaleXSq = m0 * m0 + m1 * m1 + m2 * m2;
    const scaleYSq = m4 * m4 + m5 * m5 + m6 * m6;
    const scaleZSq = m8 * m8 + m9 * m9 + m10 * m10;

    target.maxScale = Math.sqrt(Math.max(scaleXSq, scaleYSq, scaleZSq));

    target.centerX = array[offset + 12];
    target.centerY = array[offset + 13];
    target.centerZ = array[offset + 14];

    return target;
  }
}

const _box3 = new Box3();
