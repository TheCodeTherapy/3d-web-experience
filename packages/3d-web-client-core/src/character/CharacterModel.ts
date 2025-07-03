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
} from "three";

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
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const animation = await this.config.characterModelLoader.load(animationFileUrl, "animation");
      const cleanAnimation = this.cleanAnimationClips(
        this.mesh,
        animation as AnimationClip,
        true,
        discardNonRotationTransform,
      );
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
