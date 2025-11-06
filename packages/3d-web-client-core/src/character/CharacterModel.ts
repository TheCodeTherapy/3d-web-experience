import {
  MMLCharacter,
  type MMLCharacterDescription,
  parseMMLDescription,
} from "@mml-io/3d-web-avatar";
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Bone,
  Color,
  Group,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
  Vector3,
  VectorKeyframeTrack,
} from "three";

import { CameraManager } from "../camera/CameraManager";

import { AnimationConfigMetadata, CharacterDescription, LoadedAnimations } from "./Character";
import { CharacterMaterial } from "./CharacterMaterial";
import { AnimationState } from "./CharacterState";
import { captureCharacterColorsFromObject3D } from "./instancing/CharacterColourSamplingUtils";
import { CharacterModelLoader } from "./loading/CharacterModelLoader";

export const colorPartNamesIndex = [
  "hair",
  "shirt_short",
  "shirt_long",
  "pants_short",
  "pants_long",
  "shoes",
  "skin",
  "lips",
] as const;

export type ColorPartName = (typeof colorPartNamesIndex)[number];

export function colorsToColorArray(
  colors: Map<ColorPartName, Color>,
): Array<[number, number, number]> {
  const colorArray: Array<[number, number, number]> = [];
  for (const partName of colorPartNamesIndex) {
    const color = colors.get(partName);
    if (color) {
      colorArray.push([
        Math.round(color.r * 255),
        Math.round(color.g * 255),
        Math.round(color.b * 255),
      ]);
    }
  }
  return colorArray;
}

export function colorArrayToColors(
  colorArray: Array<[number, number, number]>,
): Map<ColorPartName, Color> {
  const colors = new Map<ColorPartName, Color>();
  for (let i = 0; i < colorPartNamesIndex.length; i++) {
    const color = colorArray[i];
    if (color) {
      colors.set(colorPartNamesIndex[i], new Color(color[0] / 255, color[1] / 255, color[2] / 255));
    }
  }
  return colors;
}

const tempVector = new Vector3();

function getSimpleHeight(mesh: Object3D): number {
  let maxY = -Infinity;
  let minY = Infinity;

  mesh.traverse((child) => {
    if (child instanceof Mesh || (child as Mesh).isMesh) {
      const geometry = (child as Mesh).geometry;
      if (geometry) {
        const positionAttribute = geometry.getAttribute("position");
        for (let i = 0; i < positionAttribute.count; i++) {
          const y = (child as Mesh).getVertexPosition(i, tempVector).y;
          maxY = Math.max(maxY, y);
          minY = Math.min(minY, y);
        }
      }
    }
  });
  if (maxY === -Infinity || minY === Infinity) {
    console.warn("No valid vertices found in the mesh to calculate height.");
    return 0;
  }
  return maxY - minY;
}

export type CharacterModelConfig = {
  characterDescription: CharacterDescription;
  animationsPromise: Promise<LoadedAnimations>;
  characterModelLoader: CharacterModelLoader;
  cameraManager: CameraManager;
  characterId: number;
  isLocal: boolean;
  abortController?: AbortController;
};

const remoteMaxTextureSize = 128;
const localMaxTextureSize = 1024;

export class CharacterModel {
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
  private postSlideTargetAnimation: AnimationState = AnimationState.walking;

  private colors: Array<[number, number, number]> | null = null;

  constructor(private config: CharacterModelConfig) {}

  public async init(): Promise<void> {
    // Check if operation was canceled before starting
    if (this.config.abortController?.signal.aborted) {
      console.log(`CharacterModel init canceled for ${this.config.characterId}`);
      return;
    }

    let mainMesh: Object3D | null = null;
    try {
      mainMesh = await this.loadCharacterFromDescription();
    } catch (error) {
      if (this.config.abortController?.signal.aborted) {
        return;
      }
      console.error("Failed to load character from description", error);
    }
    if (this.config.abortController?.signal.aborted) {
      return;
    }

    if (mainMesh) {
      this.mesh = mainMesh;
      this.mesh.position.set(0, -0.01, 0);
      this.mesh.traverse((child: Object3D) => {
        if (child.type === "SkinnedMesh") {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.animationMixer = new AnimationMixer(this.mesh);
    }

    // Check if operation was canceled after mesh loading
    if (this.config.abortController?.signal.aborted) {
      console.log(`CharacterModel init canceled after mesh loading for ${this.config.characterId}`);
      return;
    }

    if (this.mesh) {
      const animationConfig = await this.config.animationsPromise;

      // Check if operation was canceled after animation loading
      if (this.config.abortController?.signal.aborted) {
        return;
      }

      this.setAnimationFromFile(animationConfig.idleAnimation, AnimationState.idle);
      this.setAnimationFromFile(animationConfig.jogAnimation, AnimationState.walking);
      this.setAnimationFromFile(animationConfig.sprintAnimation, AnimationState.running);
      this.setAnimationFromFile(animationConfig.airAnimation, AnimationState.air);
      this.setAnimationFromFile(animationConfig.doubleJumpAnimation, AnimationState.doubleJump);

      // Add slide animation if present
      if (animationConfig.slideAnimation) {
        this.setAnimationFromFile(animationConfig.slideAnimation, AnimationState.slide);
      }

      this.characterHeight = getSimpleHeight(this.mesh);
      if (this.config.isLocal) {
        // Capture the colors before applying custom materials
        this.getColors();
      }
      this.applyCustomMaterials();
    }
  }

  private applyCustomMaterials(): void {
    if (!this.mesh) {
      return;
    }

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
          const material = new CharacterMaterial({
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
      // We're about to start sliding, store the current animation to return to later
      this.postSlideTargetAnimation = this.currentAnimation;
    }

    if (this.currentAnimation !== targetAnimation) {
      this.transitionToAnimation(targetAnimation);
    }
  }

  private async composeMMLCharacter(
    mmlCharacterDescription: MMLCharacterDescription,
  ): Promise<Object3D | null> {
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
        mergedCharacter = await MMLCharacter.load(
          characterBase,
          mmlCharacterDescription.parts,
          {
            load: async (url: string, abortController?: AbortController) => {
              const model = await this.config.characterModelLoader.loadModel(
                url,
                this.config.isLocal ? localMaxTextureSize : remoteMaxTextureSize,
                abortController,
              );
              if (this.config.abortController?.signal.aborted) {
                return null;
              }
              if (!model) {
                return null;
              }
              return {
                group: new Group().add(model as Object3D),
                animations: [],
              };
            },
          },
          this.config.abortController,
        );
        if (mergedCharacter) {
          return mergedCharacter;
        }
      }
    }
    return null;
  }

  private async loadCharacterFromDescription(): Promise<Object3D | null> {
    if (this.config.characterDescription.meshFileUrl) {
      return (
        (await this.config.characterModelLoader.loadModel(
          this.config.characterDescription.meshFileUrl,
          this.config.isLocal ? localMaxTextureSize : remoteMaxTextureSize,
          this.config.abortController,
        )) || null
      );
    }

    let mmlCharacterSource: string;
    let mmlCharacterUrl: string | null = null;
    if (this.config.characterDescription.mmlCharacterUrl) {
      mmlCharacterUrl = this.config.characterDescription.mmlCharacterUrl;
      const res = await fetch(mmlCharacterUrl, {
        signal: this.config.abortController?.signal,
      });
      mmlCharacterSource = await res.text();
    } else if (this.config.characterDescription.mmlCharacterString) {
      mmlCharacterSource = this.config.characterDescription.mmlCharacterString;
    } else {
      throw new Error(
        "ERROR: No Character Description was provided. Specify one of meshFileUrl, mmlCharacterUrl or mmlCharacterString",
      );
    }

    const parsedMMLDescription = parseMMLDescription(mmlCharacterSource, mmlCharacterUrl);
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

  public getColors(): Array<[number, number, number]> {
    if (!this.mesh) {
      return [];
    }
    if (this.colors) {
      return this.colors;
    }
    const colors = captureCharacterColorsFromObject3D(this.mesh, {
      circularSamplingRadius: 12,
      topDownSamplingSize: { width: 5, height: 150 },
      debug: false, // Reduced debug spam
    });
    this.colors = colorsToColorArray(colors);
    return this.colors;
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

    // apply root bone position transformation if specified before filtering
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

  private setAnimationFromFile(
    animationData: { clip: AnimationClip; config: AnimationConfigMetadata },
    animationType: AnimationState,
  ) {
    const { clip, config } = animationData;

    const keepRootBonePositionAnimation =
      !config.discardNonRotationTransform || animationType === AnimationState.idle;

    const cleanAnimation = this.cleanAnimationClips(
      this.mesh,
      clip,
      keepRootBonePositionAnimation,
      config.discardNonRotationTransform,
      config.transformRootBonePosition,
    );

    this.animations[animationType] = this.animationMixer!.clipAction(cleanAnimation);
    this.animations[animationType].stop();
    this.animations[animationType].timeScale = config.playbackSpeed;

    if (animationType === AnimationState.idle) {
      this.animations[animationType].play();
    }

    if (!config.loop) {
      this.animations[animationType].setLoop(LoopRepeat, 1); // Ensure non-looping
      this.animations[animationType].clampWhenFinished = true;
    }
  }

  private transitionToAnimation(
    targetAnimation: AnimationState,
    transitionDuration: number = 0.15,
  ): void {
    if (!this.mesh) {
      return;
    }

    const currentAction = this.animations[this.currentAnimation];
    const targetAction = this.animations[targetAnimation];

    if (!targetAction) {
      return;
    }
    this.currentAnimation = targetAnimation;

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

  dispose() {
    if (this.animationMixer) {
      this.animationMixer.stopAllAction();
      this.animationMixer.uncacheRoot(this.mesh as SkinnedMesh);
      this.animationMixer = null;
    }
    this.mesh?.traverse((child: Object3D) => {
      if (child instanceof SkinnedMesh || (child as SkinnedMesh).isSkinnedMesh) {
        const asSkinnedMesh = child as SkinnedMesh;
        if (asSkinnedMesh.geometry) {
          asSkinnedMesh.geometry.dispose();
        }
        if (asSkinnedMesh.material) {
          if (Array.isArray(asSkinnedMesh.material)) {
            asSkinnedMesh.material.forEach((material) => material.dispose());
          } else {
            asSkinnedMesh.material.dispose();
          }
        }
      }
    });
    this.mesh = null;
    this.headBone = null;
    this.characterHeight = null;
    this.animations = {};
    this.colors = null;
  }
}
