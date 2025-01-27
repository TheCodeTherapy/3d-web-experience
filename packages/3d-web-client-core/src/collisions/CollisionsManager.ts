import { MElement, MMLCollisionTrigger } from "@mml-io/mml-web";
import {
  Box3,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Group,
  Line3,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Ray,
  Scene,
  Vector3,
} from "three";
import { VertexNormalsHelper } from "three/examples/jsm/helpers/VertexNormalsHelper.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshBVH, MeshBVHHelper } from "three-mesh-bvh";

import { getRelativePositionAndRotationRelativeToObject } from "./getRelativePositionAndRotationRelativeToObject";

export type CollisionMeshState = {
  matrix: Matrix4;
  source: Group;
  meshBVH: MeshBVH;
  debugGroup?: Group;
  trackCollisions: boolean;
};

export class CollisionsManager {
  private debug: boolean = false;
  private scene: Scene;
  private tempVector: Vector3 = new Vector3();
  private tempVector2: Vector3 = new Vector3();
  private tempVector3: Vector3 = new Vector3();
  private tempQuaternion: Quaternion = new Quaternion();
  private tempRay: Ray = new Ray();
  private tempMatrix = new Matrix4();
  private tempMatrix2 = new Matrix4();
  private tempBox = new Box3();
  private tempEuler = new Euler();
  private tempSegment = new Line3();
  private tempSegment2 = new Line3();

  public collisionMeshState: Map<Group, CollisionMeshState> = new Map();
  private collisionTrigger: MMLCollisionTrigger<Group>;
  private previouslyCollidingElements: null | Map<
    Group,
    { position: { x: number; y: number; z: number } }
  >;

  constructor(scene: Scene) {
    this.scene = scene;
    this.collisionTrigger = MMLCollisionTrigger.init();
  }

  public raycastFirst(ray: Ray): [number, Vector3, CollisionMeshState] | null {
    let minimumDistance: number | null = null;
    let minimumHit: CollisionMeshState | null = null;
    let minimumNormal: Vector3 | null = new Vector3();
    for (const [, collisionMeshState] of this.collisionMeshState) {
      this.tempRay.copy(ray).applyMatrix4(this.tempMatrix.copy(collisionMeshState.matrix).invert());
      const hit = collisionMeshState.meshBVH.raycastFirst(this.tempRay, DoubleSide);
      if (hit) {
        this.tempSegment.start.copy(this.tempRay.origin);
        this.tempSegment.end.copy(hit.point);
        this.tempSegment.applyMatrix4(collisionMeshState.matrix);
        const dist = this.tempSegment.distance();
        if (minimumDistance === null || dist < minimumDistance) {
          minimumDistance = dist;
          minimumHit = collisionMeshState;
          minimumNormal = (hit.normal ? minimumNormal.copy(hit.normal) : minimumNormal)
            // Apply the rotation of the mesh to the normal
            .applyQuaternion(this.tempQuaternion.setFromRotationMatrix(collisionMeshState.matrix))
            .normalize();
        }
      }
    }
    if (minimumDistance === null || minimumNormal === null || minimumHit === null) {
      return null;
    }
    return [minimumDistance, minimumNormal, minimumHit];
  }

  private createCollisionMeshState(group: Group, trackCollisions: boolean): CollisionMeshState {
    const geometries: Array<BufferGeometry> = [];
    group.updateWorldMatrix(true, false);
    const invertedRootMatrix = this.tempMatrix.copy(group.matrixWorld).invert();
    group.traverse((child: Object3D) => {
      const asMesh = child as Mesh;
      if (asMesh.isMesh) {
        const clonedGeometry = asMesh.geometry.clone();
        if (child !== group) {
          asMesh.updateWorldMatrix(true, false);
          clonedGeometry.applyMatrix4(
            this.tempMatrix2.multiplyMatrices(invertedRootMatrix, asMesh.matrixWorld),
          );
        }

        for (const key in clonedGeometry.attributes) {
          if (key !== "position") {
            clonedGeometry.deleteAttribute(key);
          }
        }
        if (clonedGeometry.index) {
          geometries.push(clonedGeometry.toNonIndexed());
        } else {
          geometries.push(clonedGeometry);
        }
      }
    });
    const newBufferGeometry = BufferGeometryUtils.mergeGeometries(geometries, false);
    newBufferGeometry.computeVertexNormals();
    const meshBVH = new MeshBVH(newBufferGeometry);

    const meshState: CollisionMeshState = {
      source: group,
      meshBVH,
      matrix: group.matrixWorld.clone(),
      trackCollisions,
    };
    if (this.debug) {
      // Have to cast to add the boundsTree property to the geometry so that the MeshBVHHelper can find it
      (newBufferGeometry as any).boundsTree = meshBVH;

      const wireframeMesh = new Mesh(newBufferGeometry, new MeshBasicMaterial({ wireframe: true }));

      const normalsHelper = new VertexNormalsHelper(wireframeMesh, 0.25, 0x00ff00);

      const visualizer = new MeshBVHHelper(wireframeMesh, 4);
      (visualizer.edgeMaterial as LineBasicMaterial).color = new Color("blue");

      const debugGroup = new Group();
      debugGroup.add(wireframeMesh, normalsHelper, visualizer as unknown as Object3D);

      group.matrixWorld.decompose(debugGroup.position, debugGroup.quaternion, debugGroup.scale);
      visualizer.update();

      meshState.debugGroup = debugGroup;
    }
    return meshState;
  }

  public addMeshesGroup(group: Group, mElement?: MElement): void {
    if (mElement) {
      this.collisionTrigger.addCollider(group, mElement);
    }
    const meshState = this.createCollisionMeshState(group, mElement !== undefined);
    if (meshState.debugGroup) {
      this.scene.add(meshState.debugGroup);
    }
    this.collisionMeshState.set(group, meshState);
  }

  public updateMeshesGroup(group: Group): void {
    const meshState = this.collisionMeshState.get(group);
    if (meshState) {
      group.updateWorldMatrix(true, false);
      meshState.matrix.copy(group.matrixWorld);
      if (meshState.debugGroup) {
        group.matrixWorld.decompose(
          meshState.debugGroup.position,
          meshState.debugGroup.quaternion,
          meshState.debugGroup.scale,
        );
      }
    }
  }

  public removeMeshesGroup(group: Group): void {
    this.collisionTrigger.removeCollider(group);
    const meshState = this.collisionMeshState.get(group);
    if (meshState) {
      if (meshState.debugGroup) {
        this.scene.remove(meshState.debugGroup);
      }
      this.collisionMeshState.delete(group);
    }
  }

  private applyCollider(
    worldBasedCapsuleSegment: Line3,
    capsuleRadius: number,
    meshState: CollisionMeshState,
  ): Vector3 | null {
    // Create a matrix to convert from world-space to mesh-space
    const meshMatrix = this.tempMatrix.copy(meshState.matrix).invert();

    // Create the bounding box for the capsule if it were in mesh-space
    const meshRelativeCapsuleBoundingBox = this.tempBox;
    meshRelativeCapsuleBoundingBox.makeEmpty();
    meshRelativeCapsuleBoundingBox.expandByPoint(worldBasedCapsuleSegment.start);
    meshRelativeCapsuleBoundingBox.expandByPoint(worldBasedCapsuleSegment.end);
    meshRelativeCapsuleBoundingBox.min.subScalar(capsuleRadius);
    meshRelativeCapsuleBoundingBox.max.addScalar(capsuleRadius);
    meshRelativeCapsuleBoundingBox.applyMatrix4(meshMatrix);
    // Create a segment/line for the capsule in mesh-space
    const meshRelativeCapsuleSegment = this.tempSegment;
    meshRelativeCapsuleSegment.start.copy(worldBasedCapsuleSegment.start);
    meshRelativeCapsuleSegment.end.copy(worldBasedCapsuleSegment.end);
    meshRelativeCapsuleSegment.applyMatrix4(meshMatrix);

    // Keep track of where the segment started in mesh-space so that we can calculate the delta later
    const initialMeshRelativeCapsuleSegmentStart = this.tempVector3.copy(
      meshRelativeCapsuleSegment.start,
    );

    let collisionPosition: Vector3 | null = null;
    meshState.meshBVH.shapecast({
      intersectsBounds: (meshBox) => {
        // Determine if this portion of the mesh overlaps with the capsule bounding box and is therefore worth checking
        // all of the triangles within
        return meshBox.intersectsBox(meshRelativeCapsuleBoundingBox);
      },
      intersectsTriangle: (meshTriangle) => {
        const closestPointOnTriangle = this.tempVector;
        const closestPointOnSegment = this.tempVector2;
        // Find the closest point between this triangle and the capsule segment in mesh-space
        meshTriangle.closestPointToSegment(
          meshRelativeCapsuleSegment,
          closestPointOnTriangle,
          closestPointOnSegment,
        );
        // Create a line segment between the closest points
        const intersectionSegment = this.tempSegment2;
        intersectionSegment.start.copy(closestPointOnTriangle);
        intersectionSegment.end.copy(closestPointOnSegment);
        // Calculate the distance between the closest points in mesh-space
        const modelReferenceDistance = intersectionSegment.distance();

        // Calculate the distance between the points in world-space
        intersectionSegment.applyMatrix4(meshState.matrix);
        const realDistance = intersectionSegment.distance();

        // If the real distance is less than the capsule radius then there is actually a collision between the capsule
        // and the triangle
        if (realDistance < capsuleRadius) {
          if (!collisionPosition) {
            collisionPosition = new Vector3()
              .copy(closestPointOnSegment)
              .applyMatrix4(meshState.matrix);
          }
          // Calculate the ratio between the real distance and the mesh-space distance
          const ratio = realDistance / modelReferenceDistance;
          // Calculate the depth of the collision in world-space
          const realDepth = capsuleRadius - realDistance;
          // Convert that depth back into mesh-space as all calculations during collision are to a mesh-space segment
          const modelDepth = realDepth / ratio;

          // Apply a corrective movement to the segment in mesh-space
          const direction = closestPointOnSegment.sub(closestPointOnTriangle).normalize();
          meshRelativeCapsuleSegment.start.addScaledVector(direction, modelDepth);
          meshRelativeCapsuleSegment.end.addScaledVector(direction, modelDepth);
        }
      },
    });

    if (collisionPosition) {
      // If there was a collision, calculate the delta between the original mesh-space segment and the now-moved one
      const delta = this.tempVector
        .copy(meshRelativeCapsuleSegment.start)
        .sub(initialMeshRelativeCapsuleSegmentStart);

      // Use the matrix for the mesh to convert the delta vector back to world-space (remove the position component of the matrix first to avoid translation)
      this.tempMatrix.copy(meshState.matrix).setPosition(0, 0, 0);
      delta.applyMatrix4(this.tempMatrix);

      // There's a possibility that the matrix is invalid (or scale zero) and the delta is NaN - if so, don't apply the delta
      if (!(isNaN(delta.x) && isNaN(delta.y) && isNaN(delta.z))) {
        // Convert the potentially-modified mesh-space segment back to world-space
        worldBasedCapsuleSegment.start.add(delta);
        worldBasedCapsuleSegment.end.add(delta);
      }
    }

    return collisionPosition;
  }

  public applyColliders(tempSegment: Line3, radius: number) {
    const collidedElements = new Map<
      Group,
      {
        position: { x: number; y: number; z: number };
      }
    >();
    for (const meshState of this.collisionMeshState.values()) {
      const collisionPosition = this.applyCollider(tempSegment, radius, meshState);
      if (collisionPosition && meshState.trackCollisions) {
        const relativePosition = getRelativePositionAndRotationRelativeToObject(
          {
            position: collisionPosition,
            rotation: this.tempEuler.set(0, 0, 0),
          },
          meshState.source,
        );
        collidedElements.set(meshState.source, {
          position: relativePosition.position,
        });
      }
    }

    /*
     The reported collisions include elements that were reported in the previous tick to ensure that the case of an
     avatar rising to a negligible distance above the surface and immediately back down onto it does not result in a
     discontinuity in the collision lifecycle. If the element is not colliding in the next frame then it will be
     dropped.

     This results in a single tick delay of reporting leave events, but this is a reasonable trade-off to avoid
     flickering collisions.
    */
    const reportedCollidingElements = new Map(collidedElements);
    if (this.previouslyCollidingElements) {
      for (const [element, position] of this.previouslyCollidingElements) {
        if (!reportedCollidingElements.has(element)) {
          reportedCollidingElements.set(element, position);
        }
      }
    }

    // Store the elements that were genuinely collided with this tick for the next tick to preserve if they are missed
    this.previouslyCollidingElements = collidedElements;
    this.collisionTrigger.setCurrentCollisions(reportedCollidingElements);
  }
}
