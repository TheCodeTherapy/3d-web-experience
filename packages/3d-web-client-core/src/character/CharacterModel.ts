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
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
} from "three";

import { CameraManager } from "../camera/CameraManager";

import { AnimationConfig, CharacterDescription } from "./Character";
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

  private materials: Map<string, CharacterMaterial> = new Map();

  public animations: Record<string, AnimationAction> = {};
  public animationMixer: AnimationMixer | null = null;
  public currentAnimation: AnimationState = AnimationState.idle;

  public mmlCharacterDescription: MMLCharacterDescription;

  constructor(private config: CharacterModelConfig) {}

  public async init(): Promise<void> {
    await this.loadMainMesh();
    await this.setAnimationFromFile(
      this.config.animationConfig.idleAnimationFileUrl,
      AnimationState.idle,
    );
    await this.setAnimationFromFile(
      this.config.animationConfig.jogAnimationFileUrl,
      AnimationState.walking,
    );
    await this.setAnimationFromFile(
      this.config.animationConfig.sprintAnimationFileUrl,
      AnimationState.running,
    );
    await this.setAnimationFromFile(
      this.config.animationConfig.airAnimationFileUrl,
      AnimationState.air,
    );
    this.applyCustomMaterials();
  }

  private applyCustomMaterials(): void {
    if (!this.mesh) return;
    this.mesh.traverse((child: Object3D) => {
      if ((child as Bone).isBone) {
        if (child.name === "head") {
          this.headBone = child as Bone;
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
    const mainMesh = await this.loadCharacterFromDescription();
    if (typeof mainMesh !== "undefined") {
      this.setMainMesh(mainMesh as Object3D);
    } else {
      throw new Error("ERROR: No Character Model was loaded");
    }
  }

  private cleanAnimationClips(skeletalMesh: Object3D, animationClip: AnimationClip): AnimationClip {
    const availableBones = new Set<string>();
    skeletalMesh.traverse((child) => {
      const asBone = child as Bone;
      if (asBone.isBone) {
        availableBones.add(child.name);
      }
    });
    animationClip.tracks = animationClip.tracks.filter((track) => {
      const [trackName, trackProperty] = track.name.split(".");
      const shouldAnimate =
        availableBones.has(trackName) && trackProperty !== "position" && trackProperty !== "scale";
      return shouldAnimate;
    });
    return animationClip;
  }

  private async setAnimationFromFile(
    animationFileUrl: string,
    animationType: AnimationState,
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const animation = await this.config.characterModelLoader.load(animationFileUrl, "animation");
      const cleanAnimation = this.cleanAnimationClips(this.mesh!, animation as AnimationClip);
      if (typeof animation !== "undefined" && cleanAnimation instanceof AnimationClip) {
        this.animations[animationType] = this.animationMixer!.clipAction(cleanAnimation);
        this.animations[animationType].stop();
        if (animationType === AnimationState.idle) {
          this.animations[animationType].play();
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
    if (!this.mesh) return;

    const currentAction = this.animations[this.currentAnimation];
    this.currentAnimation = targetAnimation;
    const targetAction = this.animations[targetAnimation];

    if (!targetAction) return;

    if (currentAction) {
      currentAction.enabled = true;
      currentAction.fadeOut(transitionDuration);
    }

    if (!targetAction.isRunning()) targetAction.play();

    targetAction.setLoop(LoopRepeat, Infinity);
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
