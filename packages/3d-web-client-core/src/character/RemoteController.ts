import { Quaternion, Vector3 } from "three";

import { Character } from "./Character";
import { AnimationState, CharacterState } from "./CharacterState";

export type RemoteControllerConfig = {
  id: number;
  character: Character;
};

const tempQuaternion = new Quaternion();

export class RemoteController {
  public currentAnimation: AnimationState = AnimationState.idle;

  public networkState: CharacterState;

  constructor(private config: RemoteControllerConfig) {
    this.networkState = {
      id: this.config.id,
      position: {
        x: this.config.character.position.x,
        y: this.config.character.position.y,
        z: this.config.character.position.z,
      },
      rotation: {
        quaternionY: tempQuaternion.setFromEuler(this.config.character.rotation).y,
        quaternionW: 1,
      },
      state: this.currentAnimation as AnimationState,
    };
  }

  public update(clientUpdate: CharacterState, time: number, deltaTime: number): void {
    if (!this.config.character) {
      return;
    }
    this.updateFromNetwork(clientUpdate);
    this.config.character.update(time, deltaTime);
  }

  private updateFromNetwork(clientUpdate: CharacterState): void {
    const { position, rotation, state } = clientUpdate;
    this.config.character.position.lerp(new Vector3(position.x, position.y, position.z), 0.15);
    const rotationQuaternion = new Quaternion(0, rotation.quaternionY, 0, rotation.quaternionW);
    this.config.character.quaternion.slerp(rotationQuaternion, 0.6);
    if (state !== this.currentAnimation) {
      this.currentAnimation = state;
      this.config.character.updateAnimation(state);
    }
  }
}
