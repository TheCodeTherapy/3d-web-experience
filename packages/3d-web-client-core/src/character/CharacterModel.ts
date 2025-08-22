import {
  MMLCharacter,
  type MMLCharacterDescription,
  parseMMLDescription,
} from "@mml-io/3d-web-avatar";
import { ModelLoader } from "@mml-io/model-loader";
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Bone,
  Box3,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
  Vector3,
  VectorKeyframeTrack,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

import { CameraManager } from "../camera/CameraManager";

import { AnimationConfig, AnimationSettings, CharacterDescription } from "./Character";
import { CharacterMaterial } from "./CharacterMaterial";
import { CharacterModelLoader } from "./CharacterModelLoader";
import { AnimationState } from "./CharacterState";

export type CharacterModelConfig = {
  characterDescription: CharacterDescription;
  animationConfig: AnimationConfig;
  characterModelLoader: CharacterModelLoader;
  cameraManager: CameraManager;
  characterId: number;
  isLocal: boolean;
};

export class CharacterModel {
  public static ModelLoader: ModelLoader = new ModelLoader();

  public mesh: Object3D | null = null;
  public headBone: Bone | null = null;
  public characterHeight: number | null = null;

  private materials: Map<string, CharacterMaterial> = new Map();

  public animations: Record<string, AnimationAction> = {};
  public animationMixer: AnimationMixer | null = null;
  public currentAnimation: AnimationState = AnimationState.idle;

  public mmlCharacterDescription: MMLCharacterDescription;

  private isPostDoubleJump = false;
  private isPostSlide = false;

  constructor(private config: CharacterModelConfig) {}

  public async init(): Promise<void> {
    await this.loadMainMesh();
    if (this.mesh) {
      if (typeof this.config.animationConfig.idleAnimationUrlOrConfig === "string") {
        await this.setAnimationFromFile(
          this.config.animationConfig.idleAnimationUrlOrConfig as string,
          AnimationState.idle,
          true,
        );
      } else {
        const animationSetting = this.config.animationConfig
          .idleAnimationUrlOrConfig as AnimationSettings;
        await this.setAnimationFromFile(
          animationSetting.fileUrl,
          AnimationState.idle,
          animationSetting.loop,
          animationSetting.playbackSpeed,
          animationSetting.discardNonRotationTransform,
        );
      }

      if (typeof this.config.animationConfig.jogAnimationUrlOrConfig === "string") {
        await this.setAnimationFromFile(
          this.config.animationConfig.jogAnimationUrlOrConfig as string,
          AnimationState.walking,
          true,
        );
      } else {
        const animationSetting = this.config.animationConfig
          .jogAnimationUrlOrConfig as AnimationSettings;
        await this.setAnimationFromFile(
          animationSetting.fileUrl,
          AnimationState.walking,
          animationSetting.loop,
          animationSetting.playbackSpeed,
          animationSetting.discardNonRotationTransform,
        );
      }

      if (typeof this.config.animationConfig.sprintAnimationUrlOrConfig === "string") {
        await this.setAnimationFromFile(
          this.config.animationConfig.sprintAnimationUrlOrConfig as string,
          AnimationState.running,
          true,
        );
      } else {
        const animationSetting = this.config.animationConfig
          .sprintAnimationUrlOrConfig as AnimationSettings;
        await this.setAnimationFromFile(
          animationSetting.fileUrl,
          AnimationState.running,
          animationSetting.loop,
          animationSetting.playbackSpeed,
          animationSetting.discardNonRotationTransform,
        );
      }

      if (typeof this.config.animationConfig.airAnimationUrlOrConfig === "string") {
        await this.setAnimationFromFile(
          this.config.animationConfig.airAnimationUrlOrConfig as string,
          AnimationState.air,
          true,
        );
      } else {
        const animationSetting = this.config.animationConfig
          .airAnimationUrlOrConfig as AnimationSettings;
        await this.setAnimationFromFile(
          animationSetting.fileUrl,
          AnimationState.air,
          animationSetting.loop,
          animationSetting.playbackSpeed,
          animationSetting.discardNonRotationTransform,
        );
      }

      if (typeof this.config.animationConfig.doubleJumpAnimationUrlOrConfig === "string") {
        await this.setAnimationFromFile(
          this.config.animationConfig.doubleJumpAnimationUrlOrConfig as string,
          AnimationState.doubleJump,
          false,
          1.45,
        );
      } else {
        const animationSetting = this.config.animationConfig
          .doubleJumpAnimationUrlOrConfig as AnimationSettings;
        await this.setAnimationFromFile(
          animationSetting.fileUrl,
          AnimationState.doubleJump,
          false,
          animationSetting.playbackSpeed || 1.45,
          animationSetting.discardNonRotationTransform,
        );
      }

      if (typeof this.config.animationConfig.slideAnimationUrlOrConfig === "string") {
        await this.setAnimationFromFile(
          this.config.animationConfig.slideAnimationUrlOrConfig as string,
          AnimationState.slide,
          true,
        );
      } else {
        const animationSetting = this.config.animationConfig
          .slideAnimationUrlOrConfig as AnimationSettings;
        await this.setAnimationFromFile(
          animationSetting.fileUrl,
          AnimationState.slide,
          animationSetting.loop,
          animationSetting.playbackSpeed,
          animationSetting.discardNonRotationTransform,
          false,
        );
      }

      this.applyCustomMaterials();
    }
  }

  private applyCustomMaterials(): void {
    if (!this.mesh) return;
    const boundingBox = new Box3();
    this.mesh.updateWorldMatrix(true, true);
    boundingBox.expandByObject(this.mesh);
    this.characterHeight = boundingBox.max.y - boundingBox.min.y;

    this.mesh.traverse((child: Object3D) => {
      if ((child as Bone).isBone) {
        if (child.name === "head") {
          const worldPosition = new Vector3();
          this.headBone = child as Bone;
          this.headBone.getWorldPosition(worldPosition);
        }
      }
      if ((child as Mesh).isMesh || (child as SkinnedMesh).isSkinnedMesh) {
        const asMesh = child as Mesh;
        const originalMaterial = asMesh.material as MeshStandardMaterial;
        if (this.materials.has(originalMaterial.name)) {
          asMesh.material = this.materials.get(originalMaterial.name)!;
        } else {
          const material =
            originalMaterial.name === "body_replaceable_color"
              ? new CharacterMaterial({
                  isLocal: this.config.isLocal,
                  cameraManager: this.config.cameraManager,
                  characterId: this.config.characterId,
                  originalMaterial,
                })
              : new CharacterMaterial({
                  isLocal: this.config.isLocal,
                  cameraManager: this.config.cameraManager,
                  characterId: this.config.characterId,
                  originalMaterial,
                  colorOverride: originalMaterial.color,
                });
          this.materials.set(originalMaterial.name, material);
          asMesh.material = material;
        }
      }
    });
  }

  private postSlideTargetAnimation: AnimationState = AnimationState.walking;

  public updateAnimation(targetAnimation: AnimationState) {
    if (this.isPostDoubleJump) {
      if (targetAnimation === AnimationState.doubleJump) {
        // Double jump is requested, but we're in the post double jump state so we play air instead
        targetAnimation = AnimationState.air;
      } else {
        // Reset the post double jump flag if something other than double jump is requested
        this.isPostDoubleJump = false;
      }
    }

    if (this.isPostSlide) {
      if (targetAnimation === AnimationState.slide) {
        // Slide animation finished, but slide is still requested (C key still held)
        // Use the stored target animation that LocalController would want
        targetAnimation = this.postSlideTargetAnimation;
      } else {
        // Reset the post slide flag if something other than slide is requested
        this.isPostSlide = false;
      }
    }

    // Store the target animation when transitioning to slide, so we know what to return to
    if (
      targetAnimation === AnimationState.slide &&
      this.currentAnimation !== AnimationState.slide
    ) {
      // We're about to start sliding, but we need to know what animation to return to
      // Since LocalController still sends the slide animation even after it finishes,
      // we can't use the targetAnimation here. We need another approach.
      // For now, let's default to walking and let the system correct itself
      this.postSlideTargetAnimation = AnimationState.walking;
    }

    if (this.currentAnimation !== targetAnimation) {
      this.transitionToAnimation(targetAnimation);
    }
  }

  private setMainMesh(mainMesh: Object3D): void {
    this.mesh = mainMesh;
    this.mesh.position.set(0, -0.44, 0);
    this.mesh.traverse((child: Object3D) => {
      if (child.type === "SkinnedMesh") {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    this.animationMixer = new AnimationMixer(this.mesh);
  }

  private async composeMMLCharacter(
    mmlCharacterDescription: MMLCharacterDescription,
  ): Promise<Object3D | undefined> {
    if (mmlCharacterDescription.base?.url.length === 0) {
      throw new Error(
        "ERROR: An MML Character Description was provided, but it's not a valid <m-character> string, or a valid URL",
      );
    }

    let mergedCharacter: Object3D | null = null;
    if (mmlCharacterDescription) {
      const characterBase = mmlCharacterDescription.base?.url || null;
      if (characterBase) {
        this.mmlCharacterDescription = mmlCharacterDescription;
        const mmlCharacter = new MMLCharacter(CharacterModel.ModelLoader);
        mergedCharacter = await mmlCharacter.mergeBodyParts(
          characterBase,
          mmlCharacterDescription.parts,
        );
        if (mergedCharacter) {
          return mergedCharacter;
        }
      }
    }
  }

  private async loadCharacterFromDescription(): Promise<Object3D | null> {
    if (this.config.characterDescription.meshFileUrl) {
      return (
        (await this.config.characterModelLoader.load(
          this.config.characterDescription.meshFileUrl,
          "model",
        )) || null
      );
    }

    let mmlCharacterSource: string;
    if (this.config.characterDescription.mmlCharacterUrl) {
      const res = await fetch(this.config.characterDescription.mmlCharacterUrl);
      mmlCharacterSource = await res.text();
    } else if (this.config.characterDescription.mmlCharacterString) {
      mmlCharacterSource = this.config.characterDescription.mmlCharacterString;
    } else {
      throw new Error(
        "ERROR: No Character Description was provided. Specify one of meshFileUrl, mmlCharacterUrl or mmlCharacterString",
      );
    }

    const parsedMMLDescription = parseMMLDescription(mmlCharacterSource);
    const mmlCharacterDescription = parsedMMLDescription[0];
    if (parsedMMLDescription[1].length > 0) {
      console.warn("Errors parsing MML Character Description: ", parsedMMLDescription[1]);
    }
    const mmlCharacterBody = await this.composeMMLCharacter(mmlCharacterDescription);
    if (mmlCharacterBody) {
      return mmlCharacterBody;
    }
    return null;
  }

  private async loadMainMesh(): Promise<void> {
    let mainMesh: Object3D | null = null;
    try {
      mainMesh = await this.loadCharacterFromDescription();
    } catch (error) {
      console.error("Failed to load character from description", error);
    }
    if (mainMesh) {
      this.setMainMesh(mainMesh as Object3D);
    }
  }

  private cleanAnimationClips(
    skeletalMesh: Object3D | null,
    animationClip: AnimationClip,
    keepRootBonePositionAnimation: boolean,
    discardNonRotationTransform: boolean,
    transformRootBonePosition?: Vector3,
  ): AnimationClip {
    const availableBones = new Set<string>();
    if (skeletalMesh) {
      skeletalMesh.traverse((child) => {
        const asBone = child as Bone;
        if (asBone.isBone) {
          availableBones.add(child.name);
        }
      });
    }

    // Apply root bone position transformation if specified - BEFORE filtering
    if (transformRootBonePosition) {
      console.log(
        `Applying root bone transformation: ${JSON.stringify(transformRootBonePosition)}`,
      );
      console.log(`Total tracks in animation: ${animationClip.tracks.length}`);

      let foundRootPositionTrack = false;
      animationClip.tracks.forEach((track, index) => {
        console.log(`Track ${index}: name="${track.name}", values length=${track.values.length}`);
        const [trackName, trackProperty] = track.name.split(".");

        // Look for root bone position track - try different naming conventions
        if (
          (trackName === "root" ||
            trackName === "Armature" ||
            trackName.toLowerCase().includes("root")) &&
          trackProperty === "position"
        ) {
          console.log(`Found root position track: ${track.name}, applying transformation`);
          foundRootPositionTrack = true;
          // Transform the position values by adding the offset to each keyframe
          const values = track.values as Float32Array;
          console.log(`Original first position: [${values[0]}, ${values[1]}, ${values[2]}]`);

          const totalValues = values.length;
          const endPercentIndex = Math.floor(totalValues * 0.8);
          for (let i = 0; i < totalValues; i += 3) {
            let endMultiplier = 1.0;

            if (i >= endPercentIndex) {
              // We're in the last 20% - calculate linear fade from 1.0 to 0.0
              const remainingValues = totalValues - endPercentIndex;
              const currentOffset = i - endPercentIndex;
              const fadeProgress = currentOffset / remainingValues; // 0.0 to 1.0
              endMultiplier = 1.0 - fadeProgress; // 1.0 to 0.0
            }
            console.log(`end multiplier for index ${i}: ${endMultiplier}`);

            values[i] += transformRootBonePosition.x * endMultiplier; // X component
            values[i + 1] += transformRootBonePosition.y * endMultiplier; // Y component
            values[i + 2] += transformRootBonePosition.z * endMultiplier; // Z component
          }

          console.log(`Modified first position: [${values[0]}, ${values[1]}, ${values[2]}]`);
        }
      });

      if (!foundRootPositionTrack) {
        console.log("No root position track found, creating one with transformation");
        const duration = animationClip.duration;
        const fadeStartTime = duration * 0.4;
        const numKeyframes = 20;

        const times: number[] = [];
        const positions: number[] = [];

        times.push(0);
        positions.push(
          transformRootBonePosition.x,
          transformRootBonePosition.y,
          transformRootBonePosition.z,
        );

        times.push(fadeStartTime);
        positions.push(
          transformRootBonePosition.x,
          transformRootBonePosition.y,
          transformRootBonePosition.z,
        );

        for (let i = 1; i <= numKeyframes; i++) {
          const fadeProgress = i / numKeyframes; // 0.0 to 1.0
          const time = fadeStartTime + (duration - fadeStartTime) * fadeProgress;
          const multiplier = 1.0 - fadeProgress; // 1.0 to 0.0

          times.push(time);
          positions.push(
            transformRootBonePosition.x * multiplier,
            transformRootBonePosition.y * multiplier,
            transformRootBonePosition.z * multiplier,
          );
        }

        const newPositionTrack = new VectorKeyframeTrack("root.position", times, positions);
        animationClip.tracks.push(newPositionTrack);
        console.log("Created new root position track with fade-out transformation");
      }
    }

    animationClip.tracks = animationClip.tracks.filter((track) => {
      const [trackName, trackProperty] = track.name.split(".");
      if (keepRootBonePositionAnimation && trackName === "root" && trackProperty === "position") {
        return true;
      }
      let shouldAnimate = false;
      if (discardNonRotationTransform) {
        shouldAnimate =
          availableBones.has(trackName) &&
          trackProperty !== "position" &&
          trackProperty !== "scale";
      } else {
        shouldAnimate = availableBones.has(trackName);
      }
      return shouldAnimate;
    });

    return animationClip;
  }

  private async setAnimationFromFile(
    animationFileUrl: string,
    animationType: AnimationState,
    loop: boolean = true,
    playbackSpeed: number = 1.0,
    discardNonRotationTransform: boolean = true,
    exportCleanAnimationFiles?: boolean | undefined,
    transformRootBonePosition?: Vector3,
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const animation = await this.config.characterModelLoader.load(animationFileUrl, "animation");
      const cleanAnimation = this.cleanAnimationClips(
        this.mesh,
        animation as AnimationClip,
        false,
        discardNonRotationTransform,
        transformRootBonePosition,
      );

      // Export the cleaned animation using the original filename
      if (cleanAnimation instanceof AnimationClip && exportCleanAnimationFiles) {
        try {
          // Extract filename from URL (remove extension and path)
          const urlParts = animationFileUrl.split("/");
          const filenameWithExt = urlParts[urlParts.length - 1];
          const filename = filenameWithExt.replace(/\.[^/.]+$/, ""); // Remove extension
          const cleanedFilename = `${filename}_cleaned`;

          // Export the cleaned animation directly from the clip
          await this.exportAnimationClipToGLB(cleanAnimation, cleanedFilename);
        } catch (exportError) {
          console.warn(`Failed to export cleaned animation for ${animationType}:`, exportError);
          // Don't reject the main promise, just log the warning
        }
      }

      if (typeof animation !== "undefined" && cleanAnimation instanceof AnimationClip) {
        this.animations[animationType] = this.animationMixer!.clipAction(cleanAnimation);
        this.animations[animationType].stop();
        this.animations[animationType].timeScale = playbackSpeed;
        if (animationType === AnimationState.idle) {
          this.animations[animationType].play();
        }
        if (!loop) {
          this.animations[animationType].setLoop(LoopRepeat, 1); // Ensure non-looping
          this.animations[animationType].clampWhenFinished = true;
        }
        resolve();
      } else {
        reject(`failed to load ${animationType} from ${animationFileUrl}`);
      }
    });
  }

  /**
   * Exports a cleaned animation clip to a GLB file
   * @param animationType - The animation type to export
   * @param filename - The desired filename (without extension)
   * @returns Promise that resolves when the file is downloaded
   */
  public async exportCleanedAnimationToGLB(
    animationType: AnimationState,
    filename: string = "cleaned_animation",
  ): Promise<void> {
    if (!this.mesh) {
      throw new Error("No mesh loaded. Cannot export animation without a character mesh.");
    }

    const animationAction = this.animations[animationType];
    if (!animationAction) {
      throw new Error(`Animation ${animationType} not found. Load the animation first.`);
    }

    // Get the cleaned animation clip from the action
    const cleanedClip = animationAction.getClip();

    // Use SkeletonUtils.clone to properly clone the skeletal mesh with its bone structure
    const meshClone = SkeletonUtils.clone(this.mesh);

    // Create a scene with just the mesh and the cleaned animation
    const exportScene = new Object3D();
    exportScene.add(meshClone);

    // Create the exporter
    const exporter = new GLTFExporter();

    return new Promise((resolve, reject) => {
      exporter.parse(
        exportScene,
        (result) => {
          // Convert the result to a blob and download it
          const blob = new Blob([result as ArrayBuffer], { type: "application/octet-stream" });
          const url = URL.createObjectURL(blob);

          // Create a temporary download link
          const link = document.createElement("a");
          link.href = url;
          link.download = `${filename}.glb`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // Clean up
          URL.revokeObjectURL(url);
          resolve();
        },
        (error) => {
          reject(error);
        },
        {
          binary: true,
          animations: [cleanedClip], // Include the cleaned animation
          includeCustomExtensions: false,
        },
      );
    });
  }

  /**
   * Exports just the cleaned animation clip data as a GLB file (without the mesh)
   * @param animationType - The animation type to export
   * @param filename - The desired filename (without extension)
   * @returns Promise that resolves when the file is downloaded
   */
  public async exportCleanedAnimationOnlyToGLB(
    animationType: AnimationState,
    filename: string = "cleaned_animation_only",
  ): Promise<void> {
    if (!this.mesh) {
      throw new Error("No mesh loaded. Cannot export animation without a character mesh.");
    }

    const animationAction = this.animations[animationType];
    if (!animationAction) {
      throw new Error(`Animation ${animationType} not found. Load the animation first.`);
    }

    // Get the cleaned animation clip
    const cleanedClip = animationAction.getClip();

    // Use SkeletonUtils.clone to properly clone the skeletal mesh with its bone structure
    const meshClone = SkeletonUtils.clone(this.mesh);

    // Create a scene with the cloned mesh
    const exportScene = new Object3D();
    exportScene.add(meshClone);

    // Create the exporter
    const exporter = new GLTFExporter();

    return new Promise((resolve, reject) => {
      exporter.parse(
        exportScene,
        (result) => {
          // Convert the result to a blob and download it
          const blob = new Blob([result as ArrayBuffer], { type: "application/octet-stream" });
          const url = URL.createObjectURL(blob);

          // Create a temporary download link
          const link = document.createElement("a");
          link.href = url;
          link.download = `${filename}.glb`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // Clean up
          URL.revokeObjectURL(url);
          resolve();
        },
        (error) => {
          reject(error);
        },
        {
          binary: true,
          animations: [cleanedClip], // Include only the cleaned animation
          includeCustomExtensions: false,
        },
      );
    });
  }

  /**
   * Exports an animation clip directly to a GLB file
   * @param animationClip - The animation clip to export
   * @param filename - The desired filename (without extension)
   * @returns Promise that resolves when the file is downloaded
   */
  private async exportAnimationClipToGLB(
    animationClip: AnimationClip,
    filename: string,
  ): Promise<void> {
    if (!this.mesh) {
      throw new Error("No mesh loaded. Cannot export animation without a character mesh.");
    }

    // Use SkeletonUtils.clone to properly clone the skeletal mesh with its bone structure
    const meshClone = SkeletonUtils.clone(this.mesh);

    // Create a scene with the cloned mesh
    const exportScene = new Object3D();
    exportScene.add(meshClone);

    // Create the exporter
    const exporter = new GLTFExporter();

    return new Promise((resolve, reject) => {
      exporter.parse(
        exportScene,
        (result) => {
          // Convert the result to a blob and download it
          const blob = new Blob([result as ArrayBuffer], { type: "application/octet-stream" });
          const url = URL.createObjectURL(blob);

          // Create a temporary download link
          const link = document.createElement("a");
          link.href = url;
          link.download = `${filename}.glb`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // Clean up
          URL.revokeObjectURL(url);
          resolve();
        },
        (error) => {
          reject(error);
        },
        {
          binary: true,
          animations: [animationClip], // Include the animation clip
          includeCustomExtensions: false,
        },
      );
    });
  }

  private transitionToAnimation(
    targetAnimation: AnimationState,
    transitionDuration: number = 0.15,
  ): void {
    if (!this.mesh) {
      return;
    }

    const currentAction = this.animations[this.currentAnimation];
    this.currentAnimation = targetAnimation;
    const targetAction = this.animations[targetAnimation];

    if (!targetAction) {
      return;
    }

    if (currentAction) {
      currentAction.fadeOut(transitionDuration);
    }

    targetAction.reset();
    if (!targetAction.isRunning()) {
      targetAction.play();
    }

    if (targetAnimation === AnimationState.doubleJump) {
      targetAction.getMixer().addEventListener("finished", (_event) => {
        if (this.currentAnimation === AnimationState.doubleJump) {
          this.isPostDoubleJump = true;
          // This triggers the transition to the air animation because the double jump animation is done
          this.updateAnimation(AnimationState.doubleJump);
        }
      });
    }

    if (targetAnimation === AnimationState.slide) {
      targetAction.getMixer().addEventListener("finished", (_event) => {
        if (this.currentAnimation === AnimationState.slide) {
          this.isPostSlide = true;
          // This triggers the transition to the movement animation because the slide animation is done
          this.updateAnimation(AnimationState.slide);
        }
      });
    }

    targetAction.enabled = true;
    targetAction.fadeIn(transitionDuration);
  }

  update(time: number) {
    if (this.animationMixer) {
      this.animationMixer.update(time);
      this.materials.forEach((material) => material.update());
    }
  }
}
