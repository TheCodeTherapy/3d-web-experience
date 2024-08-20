import { ModelLoadResult } from "@mml-io/model-loader";
import {
  Bone,
  BufferAttribute,
  Group,
  InterleavedBufferAttribute,
  MathUtils,
  Object3D,
  Skeleton,
  SkinnedMesh,
} from "three";

import { MMLCharacterDescriptionPart } from "../helpers/parseMMLDescription";

type MMLCharacterModelLoader = {
  load: (url: string) => Promise<ModelLoadResult>;
};

export class MMLCharacter {
  constructor(private modelLoader: MMLCharacterModelLoader) {}

  private createBoneIndexMap(
    originSkeleton: Skeleton,
    targetSkeleton: Skeleton,
  ): Map<number, number> {
    const boneIndexMap = new Map<number, number>();

    for (let i = 0; i < originSkeleton.bones.length; i++) {
      const originBone = originSkeleton.bones[i];
      const targetBone = targetSkeleton.bones.find((bone) => bone.name === originBone.name);
      if (targetBone) {
        boneIndexMap.set(i, targetSkeleton.bones.indexOf(targetBone));
      }
    }
    return boneIndexMap;
  }

  private remapBoneIndices(skinnedMesh: SkinnedMesh, targetSkeleton: Skeleton): void {
    const originSkeleton = skinnedMesh.skeleton;
    const originGeometry = skinnedMesh.geometry;

    const boneIndexMap = this.createBoneIndexMap(originSkeleton, targetSkeleton);

    const newSkinIndexArray = [];
    const missingBoneIndices = new Set();

    const skinIndexAttribute = originGeometry.attributes.skinIndex;
    for (let i = 0; i < skinIndexAttribute.count; i++) {
      const originIndex = skinIndexAttribute.getComponent(i, 0);
      const targetIndex = boneIndexMap.get(originIndex);
      if (targetIndex !== undefined) {
        skinIndexAttribute.setComponent(i, 0, targetIndex);
      } else {
        missingBoneIndices.add(originIndex);
      }
    }

    if (missingBoneIndices.size > 0) {
      console.warn(
        `Missing bone indices in skinIndex attribute: ${Array.from(missingBoneIndices).join(", ")}`,
      );
    }
  }

  public async mergeBodyParts(
    fullBodyURL: string,
    bodyParts: Array<MMLCharacterDescriptionPart>,
  ): Promise<Object3D> {
    const group = new Group();

    const fullBodyAssetPromise = this.modelLoader.load(fullBodyURL);

    const assetPromises: Array<
      Promise<{ asset: ModelLoadResult; part: MMLCharacterDescriptionPart }>
    > = bodyParts.map((part) => {
      return new Promise((resolve) => {
        this.modelLoader.load(part.url).then((asset) => {
          resolve({ asset, part });
        });
      });
    });

    const fullBodyAsset = await fullBodyAssetPromise;
    const assets = await Promise.all(assetPromises);

    const rawBodyGltf = fullBodyAsset.group;
    const availableBones = new Map<string, Bone>();
    rawBodyGltf.traverse((child) => {
      const asBone = child as Bone;
      if (asBone.isBone) {
        availableBones.set(child.name, asBone);
      }

      const asSkinnedMesh = child as SkinnedMesh;
      if (asSkinnedMesh.isSkinnedMesh) {
        asSkinnedMesh.castShadow = true;
        asSkinnedMesh.receiveShadow = true;
      }
    });
    const foundSkinnedMeshes: Array<SkinnedMesh> = [];
    rawBodyGltf.traverse((child) => {
      const asSkinnedMesh = child as SkinnedMesh;
      if (asSkinnedMesh.isSkinnedMesh) {
        foundSkinnedMeshes.push(asSkinnedMesh);
      }
    });

    if (foundSkinnedMeshes.length === 0) {
      throw new Error("No skinned mesh in base model file");
    }
    if (foundSkinnedMeshes.length > 1) {
      console.warn(
        "Multiple skinned meshes in base model file. Expected 1. Using first for skeleton.",
      );
    }
    const skinnedMesh = foundSkinnedMeshes[0];
    group.add(...foundSkinnedMeshes);
    const sharedSkeleton = skinnedMesh.skeleton;
    group.add(skinnedMesh.skeleton.bones[0]);
    const sharedMatrixWorld = skinnedMesh.matrixWorld;

    for (const loadingAsset of assets) {
      const part = loadingAsset.part;
      const rawGltf = loadingAsset.asset;

      const modelGroup = rawGltf.group;
      if (part.socket) {
        const socketName = part.socket.socket;
        let bone = availableBones.get("root");
        if (availableBones.has(socketName)) {
          bone = availableBones.get(socketName);
        } else {
          console.warn(
            `WARNING: no bone found for [${socketName}] socket. Attatching to Root bone`,
          );
        }
        if (bone) {
          bone.add(modelGroup);

          modelGroup.position.set(
            part.socket.position.x,
            part.socket.position.y,
            part.socket.position.z,
          );

          modelGroup.rotation.set(
            MathUtils.degToRad(part.socket.rotation.x),
            MathUtils.degToRad(part.socket.rotation.y),
            MathUtils.degToRad(part.socket.rotation.z),
          );

          modelGroup.scale.set(part.socket.scale.x, part.socket.scale.y, part.socket.scale.z);
        }
      } else {
        const skinnedMeshes: Array<SkinnedMesh> = [];
        modelGroup.traverse((child) => {
          const asSkinnedMesh = child as SkinnedMesh;
          if (asSkinnedMesh.isSkinnedMesh) {
            skinnedMeshes.push(asSkinnedMesh);
          }
        });
        for (const skinnedMeshPart of skinnedMeshes) {
          this.remapBoneIndices(skinnedMeshPart, sharedSkeleton);
          skinnedMeshPart.castShadow = true;
          skinnedMeshPart.receiveShadow = true;
          skinnedMeshPart.bind(sharedSkeleton, sharedMatrixWorld!);
          skinnedMeshPart.children = [];
          group.add(skinnedMeshPart);
        }
      }
    }
    return group;
  }
}
