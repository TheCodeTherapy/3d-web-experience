import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from "three";

import { CharacterDescription } from "./Character";
import { CharacterMaterial } from "./CharacterMaterial";
import { AnimationState } from "./CharacterState";
import MODEL_LOADER from "./ModelLoader";

export class CharacterModel {
  /* TODO: pick between below eager instantiation or ModelLoader.getInstance() lazy one */
  private modelLoader = MODEL_LOADER;

  public mesh: Object3D | null = null;
  public material: CharacterMaterial = new CharacterMaterial();

  public animations: Record<string, AnimationAction> = {};
  public animationMixer: AnimationMixer | null = null;
  public currentAnimation: AnimationState = AnimationState.idle;

  constructor(private readonly characterDescription: CharacterDescription) {}

  public async init(): Promise<void> {
    await this.loadMainMesh();
    await this.setAnimationFromFile(
      this.characterDescription.idleAnimationFileUrl,
      AnimationState.idle,
    );
    await this.setAnimationFromFile(
      this.characterDescription.jogAnimationFileUrl,
      AnimationState.walking,
    );
    await this.setAnimationFromFile(
      this.characterDescription.sprintAnimationFileUrl,
      AnimationState.running,
    );
    await this.setAnimationFromFile(
      this.characterDescription.airAnimationFileUrl,
      AnimationState.air,
    );
    this.applyMaterialToAllSkinnedMeshes(this.material);
  }

  public updateAnimation(targetAnimation: AnimationState, deltaTime: number) {
    if (this.currentAnimation !== targetAnimation) {
      this.transitionToAnimation(targetAnimation);
    }
    this.animationMixer?.update(deltaTime);
  }

  public hideMaterialByMeshName(meshName: any): void {
    if (!this.mesh) return;
    this.mesh.traverse((child: Object3D) => {
      if (child.type === "SkinnedMesh" && child.name === meshName) {
        (child as Mesh).material = new MeshStandardMaterial({
          color: 0xff0000,
          transparent: true,
          opacity: 0,
        });
      }
    });
  }

  private setShadows(
    mesh: Object3D,
    castShadow: boolean = true,
    receiveShadow: boolean = true,
  ): void {
    mesh.traverse((child: Object3D) => {
      if (child.type === "SkinnedMesh") {
        child.castShadow = castShadow;
        child.receiveShadow = receiveShadow;
      }
    });
  }

  private applyMaterialToAllSkinnedMeshes(material: any): void {
    if (!this.mesh) return;
    this.mesh.traverse((child: Object3D) => {
      if (child.type === "SkinnedMesh") {
        (child as Mesh).material = material;
      }
    });
  }

  private initAnimationMixer() {
    if (this.animationMixer !== null || this.mesh === null) return;
    this.animationMixer = new AnimationMixer(this.mesh);
  }

  private async loadMainMesh(): Promise<void> {
    const mainMeshUrl = this.characterDescription.meshFileUrl;
    const scale = this.characterDescription.modelScale;
    const extension = mainMeshUrl.split(".").pop();
    const name = mainMeshUrl.split("/").pop()!.replace(`.${extension}`, "");
    const mainMesh = await this.modelLoader.load(mainMeshUrl, "model");
    if (typeof mainMesh !== "undefined") {
      this.mesh = new Object3D();
      const model = mainMesh as Object3D;
      model.position.set(0, -0.4, 0);
      this.mesh.add(model);
      this.mesh.name = name;
      this.mesh.scale.set(scale, scale, scale);
      this.setShadows(this.mesh);
    }
  }

  private async setAnimationFromFile(
    animationFileUrl: string,
    animationType: AnimationState,
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      this.initAnimationMixer();
      const animation = await this.modelLoader.load(animationFileUrl, "animation");
      if (typeof animation !== "undefined" && animation instanceof AnimationClip) {
        this.animations[animationType] = this.animationMixer!.clipAction(animation);
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
    if (!this.mesh || this.currentAnimation === null) return;

    const currentAction = this.animations[this.currentAnimation];
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

    this.currentAnimation = targetAnimation;
  }
}
