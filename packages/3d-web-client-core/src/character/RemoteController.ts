import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Object3D,
  Quaternion,
  Vector3,
} from "three";

import { Character } from "./Character";
import { AnimationState, CharacterState } from "./CharacterState";
import MODEL_LOADER from "./ModelLoader";

export class RemoteController {
  private modelLoader = MODEL_LOADER;

  public characterModel: Object3D | null = null;

  private animationMixer: AnimationMixer = new AnimationMixer(new Object3D());
  private animations = new Map<AnimationState, AnimationAction>();
  public currentAnimation: AnimationState = AnimationState.idle;

  public networkState: CharacterState;

  constructor(
    public readonly character: Character,
    public readonly id: number,
  ) {
    this.characterModel = this.character.model!.mesh!;
    this.characterModel.updateMatrixWorld();
    this.animationMixer = new AnimationMixer(this.characterModel);
    this.networkState = {
      id: this.id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { quaternionY: 0, quaternionW: 1 },
      state: this.currentAnimation as AnimationState,
    };
  }

  public update(clientUpdate: CharacterState, time: number, deltaTime: number): void {
    if (!this.character) return;
    this.character.update(time);
    this.updateFromNetwork(clientUpdate);
    this.animationMixer.update(deltaTime);
  }

  public async setAnimationFromFile(
    animationType: AnimationState,
    fileName: string,
  ): Promise<void> {
    const animation = await this.modelLoader.load(fileName, "animation");
    const animationAction = this.animationMixer.clipAction(animation as AnimationClip);
    this.animations.set(animationType, animationAction);
    if (animationType === AnimationState.idle) {
      animationAction.play();
    }
  }

  private transitionToAnimation(
    targetAnimation: AnimationState,
    transitionDuration: number = 0.15,
  ): void {
    if (this.currentAnimation === targetAnimation) return;

    const currentAction = this.animations.get(this.currentAnimation);
    const targetAction = this.animations.get(targetAnimation);

    if (!targetAction) return;

    if (currentAction) {
      currentAction.enabled = true;
      targetAction
        .reset()
        .setEffectiveTimeScale(1)
        .setEffectiveWeight(1)
        .fadeIn(transitionDuration)
        .play();
      currentAction.crossFadeTo(targetAction, transitionDuration, true);
    } else {
      targetAction.play();
    }

    this.currentAnimation = targetAnimation;
  }

  private updateFromNetwork(clientUpdate: CharacterState): void {
    if (!this.characterModel) return;
    const { position, rotation, state } = clientUpdate;
    this.characterModel.position.lerp(new Vector3(position.x, position.y, position.z), 0.15);
    const rotationQuaternion = new Quaternion(0, rotation.quaternionY, 0, rotation.quaternionW);
    this.characterModel.quaternion.slerp(rotationQuaternion, 0.6);
    if (state !== this.currentAnimation) {
      this.transitionToAnimation(state);
    }
  }
}
