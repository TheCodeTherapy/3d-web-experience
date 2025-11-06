import { Quaternion, Vector3 } from "three";

import { Character } from "./Character";
import { CharacterState } from "./CharacterState";

export type RemoteControllerConfig = {
  character: Character;
};

const tempQuaternion = new Quaternion();

export class RemoteController {
  public networkState: CharacterState;

  private hasReceivedInitialUpdate = false;
  private interpolationRate = 8.0; // How quickly to interpolate (higher = faster)

  constructor(private character: Character) {
    const pos = character.getPosition();
    const rot = character.getRotation();
    const currentAnimation = character.getCurrentAnimation();

    this.networkState = {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { quaternionY: rot.y, quaternionW: 1 },
      state: currentAnimation,
    };
  }

  public update(clientUpdate: CharacterState, time: number, deltaTime: number): void {
    if (!this.character) return;
    this.updateFromNetwork(clientUpdate, deltaTime);
    this.character.update(time, deltaTime);
  }

  private updateFromNetwork(clientUpdate: CharacterState, deltaTime: number): void {
    const { position, rotation, state } = clientUpdate;

    const currentPos = new Vector3().copy(this.character.getPosition());
    const targetPos = new Vector3(position.x, position.y, position.z);

    const rotationQuaternion = tempQuaternion.set(0, rotation.quaternionY, 0, rotation.quaternionW);

    if (!this.hasReceivedInitialUpdate) {
      // First update, snap into position
      this.character.setPosition(targetPos.x, targetPos.y, targetPos.z);

      // Also snap rotation on first update
      this.character.setRotation(
        rotationQuaternion.x,
        rotationQuaternion.y,
        rotationQuaternion.z,
        rotationQuaternion.w,
      );

      this.hasReceivedInitialUpdate = true;
    } else {
      const distSq = currentPos.distanceToSquared(targetPos);
      // More than 5m of movement in a tick
      // the character is likely teleporting rather than just moving quickly
      // snap to the new position
      if (distSq > 5 * 5) {
        this.character.setPosition(targetPos.x, targetPos.y, targetPos.z);
      } else {
        // Frame-rate independent exponential smoothing
        const lerpFactor = Math.min(1.0, 1.0 - Math.exp(-this.interpolationRate * deltaTime));
        const interpolatedPos = currentPos.lerp(targetPos, lerpFactor);
        this.character.setPosition(interpolatedPos.x, interpolatedPos.y, interpolatedPos.z);
      }

      // Smooth rotation interpolation
      const currentRot = this.character.getRotation();
      const currentRotQuat = new Quaternion().setFromEuler(currentRot);

      // Frame-rate independent exponential smoothing for rotation
      const lerpFactor = Math.min(1.0, 1.0 - Math.exp(-this.interpolationRate * deltaTime));
      const interpolatedRot = currentRotQuat.slerp(rotationQuaternion, lerpFactor);

      this.character.setRotation(
        interpolatedRot.x,
        interpolatedRot.y,
        interpolatedRot.z,
        interpolatedRot.w,
      );
    }

    if (state !== this.character.getCurrentAnimation()) {
      this.character.updateAnimation(state);
    }
  }
}
