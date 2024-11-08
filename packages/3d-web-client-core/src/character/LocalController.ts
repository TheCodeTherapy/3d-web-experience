import { Euler, Line3, Matrix4, Quaternion, Ray, Raycaster, Vector3 } from "three";

import { CameraManager } from "../camera/CameraManager";
import { CollisionMeshState, CollisionsManager } from "../collisions/CollisionsManager";
import { KeyInputManager } from "../input/KeyInputManager";
import { VirtualJoystick } from "../input/VirtualJoystick";
import { TimeManager } from "../time/TimeManager";
import { characterControllerValues } from "../tweakpane/blades/characterControlsFolder";

import { Character } from "./Character";
import { AnimationState, CharacterState } from "./CharacterState";

const downVector = new Vector3(0, -1, 0);

export type LocalControllerConfig = {
  id: number;
  character: Character;
  collisionsManager: CollisionsManager;
  keyInputManager: KeyInputManager;
  virtualJoystick?: VirtualJoystick;
  cameraManager: CameraManager;
  timeManager: TimeManager;
};

export class LocalController {
  public capsuleInfo = {
    radius: 0.45,
    segment: new Line3(new Vector3(), new Vector3(0, 1.05, 0)),
  };

  public gravity: number = -characterControllerValues.gravity;
  public jumpForce: number = characterControllerValues.jumpForce;
  public doubleJumpForce: number = characterControllerValues.doubleJumpForce;
  public coyoteTimeThreshold: number = characterControllerValues.coyoteJump;
  public canJump: boolean = true;
  public canDoubleJump: boolean = true;
  public coyoteJumped = false;
  public doubleJumpUsed: boolean = false;
  public jumpCounter: number = 0;

  public airResistance = characterControllerValues.airResistance;
  public groundResistance = 0.99999999 + characterControllerValues.groundResistance * 1e-7;
  public airControlModifier = characterControllerValues.airControlModifier;
  public groundWalkControl = characterControllerValues.groundWalkControl;
  public groundRunControl = characterControllerValues.groundRunControl;
  public baseControl = characterControllerValues.baseControlMultiplier;
  public minimumSurfaceAngle = characterControllerValues.minimumSurfaceAngle;

  public latestPosition: Vector3 = new Vector3();
  public characterOnGround: boolean = false;
  public coyoteTime: boolean = false;

  private collisionDetectionSteps = 15;

  private characterWasOnGround: boolean = false;
  private characterAirborneSince: number = 0;
  private currentHeight: number = 0;
  private currentSurfaceAngle = new Vector3();

  private characterVelocity: Vector3 = new Vector3();
  private vectorUp: Vector3 = new Vector3(0, 1, 0);
  private vectorDown: Vector3 = new Vector3(0, -1, 0);

  private rotationOffset: number = 0;
  private azimuthalAngle: number = 0;

  private tempMatrix: Matrix4 = new Matrix4();
  private tempSegment: Line3 = new Line3();
  private tempQuaternion: Quaternion = new Quaternion();
  private tempEuler: Euler = new Euler();
  private tempVector: Vector3 = new Vector3();
  private tempVector2: Vector3 = new Vector3();
  private tempVector3: Vector3 = new Vector3();
  private rayCaster: Raycaster = new Raycaster();

  private surfaceTempQuaternion = new Quaternion();
  private surfaceTempQuaternion2 = new Quaternion();
  private surfaceTempVector1 = new Vector3();
  private surfaceTempVector2 = new Vector3();
  private surfaceTempVector3 = new Vector3();
  private surfaceTempVector4 = new Vector3();
  private surfaceTempVector5 = new Vector3();
  private surfaceTempRay = new Ray();
  private lastFrameSurfaceState:
    | [
        CollisionMeshState,
        {
          lastMatrix: Matrix4;
        },
      ]
    | null = null;

  public jumpPressed: boolean = false; // Tracks if the jump button is pressed
  public jumpReleased: boolean = true; // Indicates if the jump button has been released

  public networkState: CharacterState;
  private controlState: { direction: number | null; isSprinting: boolean; jump: boolean } | null =
    null;

  private respawnDiv = document.createElement("div");
  private appHolder: HTMLDivElement | null = null;

  constructor(private config: LocalControllerConfig) {
    this.networkState = {
      id: this.config.id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { quaternionY: 0, quaternionW: 1 },
      state: AnimationState.idle,
    };
    this.appHolder = document.getElementById("appHolder") as HTMLDivElement;
    this.respawnDiv.setAttribute("id", "respawn-button");
    this.respawnDiv.style.lineHeight = "25px";
    this.respawnDiv.style.height = "24px";
    this.respawnDiv.style.width = "60px";
    this.respawnDiv.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    this.respawnDiv.style.position = "fixed";
    this.respawnDiv.style.top = "12px";
    this.respawnDiv.style.right = "12px";
    this.respawnDiv.style.color = "rgb(255, 255, 255)";
    this.respawnDiv.style.textAlign = "center";
    this.respawnDiv.style.fontSize = "12px";
    this.respawnDiv.style.verticalAlign = "middle";
    this.respawnDiv.style.borderRadius = "5px";
    this.respawnDiv.style.cursor = "pointer";
    this.respawnDiv.style.fontFamily = "monospace";
    this.respawnDiv.style.fontWeight = "900";
    this.respawnDiv.style.zIndex = "99999";
    this.respawnDiv.style.border = "1px solid rgba(255, 255, 255, 0.5)";
    this.respawnDiv.innerText = "RESPAWN";

    this.respawnDiv.addEventListener("click", (event) => {
      event.preventDefault();
      if (event.button === 0) {
        this.respawn();
      }
    });
    this.appHolder?.appendChild(this.respawnDiv);
  }

  public update(): void {
    this.controlState =
      this.config.keyInputManager.getOutput() || this.config.virtualJoystick?.getOutput() || null;

    this.rayCaster.set(this.config.character.position, this.vectorDown);
    const firstRaycastHit = this.config.collisionsManager.raycastFirst(this.rayCaster.ray);
    if (firstRaycastHit !== null) {
      this.currentHeight = firstRaycastHit[0];
      this.currentSurfaceAngle.copy(firstRaycastHit[1]);
    }

    if (this.controlState?.direction !== null || !this.characterOnGround) {
      const targetAnimation = this.getTargetAnimation();
      this.config.character.updateAnimation(targetAnimation);
    } else {
      this.config.character.updateAnimation(AnimationState.idle);
    }

    if (this.controlState) {
      this.updateRotation();
    }

    for (let i = 0; i < this.collisionDetectionSteps; i++) {
      this.updatePosition(
        this.config.timeManager.deltaTime,
        this.config.timeManager.deltaTime / this.collisionDetectionSteps,
        i,
      );
    }

    // Allow the user to fall far below zero before resetting
    // TODO - Might want to make this a configurable value
    if (this.config.character.position.y < -100) {
      this.resetPosition();
    }
    this.updateNetworkState();
  }

  private getTargetAnimation(): AnimationState {
    if (!this.config.character) return AnimationState.idle;

    const jumpHeight = this.characterVelocity.y > 0 ? 0.2 : 1.8;
    if (this.currentHeight > jumpHeight && !this.characterOnGround) {
      if (this.doubleJumpUsed) {
        return AnimationState.doubleJump;
      }
      return AnimationState.air;
    }
    if (!this.controlState) {
      return AnimationState.idle;
    }

    if (this.controlState.isSprinting) {
      return AnimationState.running;
    }

    return AnimationState.walking;
  }

  private updateRotationOffset(): void {
    if (this.controlState && this.controlState.direction !== null) {
      this.rotationOffset = this.controlState.direction;
    }
  }

  private updateAzimuthalAngle(): void {
    const camToModelDistance = this.config.cameraManager
      .getActiveCamera()
      .position.distanceTo(this.config.character.position);
    const isCameraFirstPerson = camToModelDistance < 2;
    if (isCameraFirstPerson) {
      const cameraForward = this.tempVector
        .set(0, 0, 1)
        .applyQuaternion(this.config.cameraManager.getActiveCamera().quaternion);
      this.azimuthalAngle = Math.atan2(cameraForward.x, cameraForward.z);
    } else {
      this.azimuthalAngle = Math.atan2(
        this.config.cameraManager.getActiveCamera().position.x - this.config.character.position.x,
        this.config.cameraManager.getActiveCamera().position.z - this.config.character.position.z,
      );
    }
  }

  private computeAngularDifference(rotationQuaternion: Quaternion): number {
    return 2 * Math.acos(Math.abs(this.config.character.quaternion.dot(rotationQuaternion)));
  }

  private updateRotation(): void {
    this.updateRotationOffset();
    this.updateAzimuthalAngle();
    const rotationQuaternion = this.tempQuaternion.setFromAxisAngle(
      this.vectorUp,
      this.azimuthalAngle + this.rotationOffset,
    );
    const angularDifference = this.computeAngularDifference(rotationQuaternion);
    const desiredTime = 0.07;
    const angularSpeed = angularDifference / desiredTime;
    const frameRotation = angularSpeed * this.config.timeManager.deltaTime;
    this.config.character.quaternion.rotateTowards(rotationQuaternion, frameRotation);
  }

  private processJump(currentAcceleration: Vector3, deltaTime: number) {
    const jump = this.controlState?.jump;

    if (this.characterOnGround) {
      this.coyoteJumped = false;
      this.canDoubleJump = false;
      this.doubleJumpUsed = false;
      this.jumpCounter = 0;

      if (!jump) {
        this.canDoubleJump = !this.doubleJumpUsed && this.jumpReleased && this.jumpCounter === 1;
        this.canJump = true;
        this.jumpReleased = true;
      }

      if (jump && this.canJump && this.jumpReleased) {
        currentAcceleration.y += this.jumpForce / deltaTime;
        this.canJump = false;
        this.jumpReleased = false;
        this.jumpCounter++;
      } else {
        if (this.currentSurfaceAngle.y < this.minimumSurfaceAngle) {
          currentAcceleration.y += this.gravity;
        }
      }
    } else {
      if (jump && !this.coyoteJumped && this.coyoteTime) {
        this.coyoteJumped = true;
        currentAcceleration.y += this.jumpForce / deltaTime;
        this.canJump = false;
        this.jumpReleased = false;
        this.jumpCounter++;
      } else if (jump && this.canDoubleJump) {
        currentAcceleration.y += this.doubleJumpForce / deltaTime;
        this.doubleJumpUsed = true;
        this.jumpReleased = false;
        this.jumpCounter++;
      } else {
        currentAcceleration.y += this.gravity;
        this.canJump = false;
      }
    }

    if (!jump) {
      this.jumpReleased = true;
      if (!this.characterOnGround) {
        currentAcceleration.y += this.gravity;
      }
    }
  }

  private applyControls(deltaTime: number) {
    const resistance = this.characterOnGround ? this.groundResistance : this.airResistance;

    // Dampen the velocity based on the resistance
    const speedFactor = Math.pow(1 - resistance, deltaTime);
    this.characterVelocity.multiplyScalar(speedFactor);

    const acceleration = this.tempVector.set(0, 0, 0);
    this.canDoubleJump = !this.doubleJumpUsed && this.jumpReleased && this.jumpCounter === 1;
    this.processJump(acceleration, deltaTime);

    const control =
      (this.characterOnGround
        ? this.controlState?.isSprinting
          ? this.groundRunControl
          : this.groundWalkControl
        : this.airControlModifier) * this.baseControl;

    const controlAcceleration = this.tempVector2.set(0, 0, 0);

    if (this.controlState && this.controlState.direction !== null) {
      // convert heading to direction vector
      const heading = this.controlState.direction;
      const headingVector = this.tempVector3
        .set(0, 0, 1)
        .applyAxisAngle(this.vectorUp, this.azimuthalAngle + heading);
      controlAcceleration.add(headingVector);
    }
    if (controlAcceleration.length() > 0) {
      controlAcceleration.normalize();
      controlAcceleration.multiplyScalar(control);
    }
    acceleration.add(controlAcceleration);
    this.characterVelocity.addScaledVector(acceleration, deltaTime);

    this.config.character.position.addScaledVector(this.characterVelocity, deltaTime);
  }

  private updatePosition(deltaTime: number, stepDeltaTime: number, iter: number): void {
    this.applyControls(stepDeltaTime);

    if (iter === 0) {
      const lastMovement = this.getMovementFromSurfaces(this.config.character.position, deltaTime);
      if (lastMovement) {
        this.config.character.position.add(lastMovement.position);
        const asQuaternion = this.tempQuaternion.setFromEuler(this.config.character.rotation);
        const lastMovementEuler = this.tempEuler.setFromQuaternion(lastMovement.rotation);
        lastMovementEuler.x = 0;
        lastMovementEuler.z = 0;
        lastMovement.rotation.setFromEuler(lastMovementEuler);
        asQuaternion.multiply(lastMovement.rotation);
        this.config.character.rotation.setFromQuaternion(asQuaternion);
      }
    }
    this.config.character.updateMatrixWorld();

    const avatarSegment = this.tempSegment;
    avatarSegment.copy(this.capsuleInfo.segment!);
    avatarSegment.start
      .applyMatrix4(this.config.character.matrixWorld)
      .applyMatrix4(this.tempMatrix);
    avatarSegment.end.applyMatrix4(this.config.character.matrixWorld).applyMatrix4(this.tempMatrix);

    const positionBeforeCollisions = this.tempVector.copy(avatarSegment.start);
    this.config.collisionsManager.applyColliders(avatarSegment, this.capsuleInfo.radius!);
    this.config.character.position.copy(avatarSegment.start);
    const deltaCollisionPosition = avatarSegment.start.sub(positionBeforeCollisions);

    this.characterOnGround = deltaCollisionPosition.y > 0;

    if (this.characterOnGround) {
      this.doubleJumpUsed = false;
      this.jumpCounter = 0;
    }

    if (this.characterWasOnGround && !this.characterOnGround) {
      this.characterAirborneSince = Date.now();
    }

    if (!this.controlState?.jump) {
      this.jumpReleased = true;
    }

    this.coyoteTime =
      this.characterVelocity.y < 0 &&
      !this.characterOnGround &&
      Date.now() - this.characterAirborneSince < this.coyoteTimeThreshold;

    this.latestPosition = this.config.character.position.clone();
    this.characterWasOnGround = this.characterOnGround;
  }

  public getMovementFromSurfaces(userPosition: Vector3, deltaTime: number) {
    let lastMovement: { rotation: Quaternion; position: Vector3 } | null = null;

    // If we have a last frame state, we can calculate the movement of the mesh to apply it to the user
    if (this.lastFrameSurfaceState !== null) {
      const meshState = this.lastFrameSurfaceState[0];

      // Extract the matrix from the current frame and the last frame
      const currentFrameMatrix = meshState.matrix;
      const lastFrameMatrix = this.lastFrameSurfaceState[1].lastMatrix;

      if (lastFrameMatrix.equals(currentFrameMatrix)) {
        // No movement from this mesh - do nothing
      } else {
        // The mesh has moved since the last frame - calculate the movement

        // Get the position of the mesh in the last frame
        const lastMeshPosition = this.surfaceTempVector1;
        const lastMeshRotation = this.surfaceTempQuaternion;
        lastFrameMatrix.decompose(lastMeshPosition, lastMeshRotation, this.surfaceTempVector3);

        // Get the position of the mesh in the current frame
        const currentMeshPosition = this.surfaceTempVector2;
        const currentMeshRotation = this.surfaceTempQuaternion2;
        currentFrameMatrix.decompose(
          currentMeshPosition,
          currentMeshRotation,
          this.surfaceTempVector3,
        );

        // Calculate the difference between the new position and the old position to determine the movement due to translation of position
        const meshTranslationDelta = this.surfaceTempVector5
          .copy(currentMeshPosition)
          .sub(lastMeshPosition);

        // Calculate the relative position of the user to the mesh in the last frame
        const lastFrameRelativeUserPosition = this.surfaceTempVector3
          .copy(userPosition)
          .sub(lastMeshPosition);

        // Calculate the relative quaternion of the mesh in the last frame to the mesh in the current frame
        const meshRotationDelta = lastMeshRotation.invert().multiply(currentMeshRotation);

        // Apply the relative quaternion to the relative user position to determine the new position of the user given just the rotation
        const translationDueToRotation = this.surfaceTempVector4
          .copy(lastFrameRelativeUserPosition)
          .applyQuaternion(meshRotationDelta)
          .sub(lastFrameRelativeUserPosition);

        // Combine the mesh translation delta and the rotation translation delta to determine the total movement of the user
        const translationAndRotationPositionDelta = this.surfaceTempVector1
          .copy(meshTranslationDelta)
          .add(translationDueToRotation);

        lastMovement = {
          position: translationAndRotationPositionDelta,
          rotation: meshRotationDelta,
        };
        lastFrameMatrix.copy(currentFrameMatrix);
      }
    }

    const newPosition = this.surfaceTempVector3.copy(userPosition);
    if (lastMovement) {
      newPosition.add(lastMovement.position);
    }
    newPosition.setY(newPosition.y + 0.05);

    // Raycast down from the new position to see if there is a surface below the user which will be tracked in the next frame
    const ray = this.surfaceTempRay.set(newPosition, downVector);
    const hit = this.config.collisionsManager.raycastFirst(ray);
    if (hit && hit[0] < 0.8) {
      // There is a surface below the user
      const currentCollisionMeshState = hit[2];
      this.lastFrameSurfaceState = [
        currentCollisionMeshState,
        { lastMatrix: currentCollisionMeshState.matrix.clone() },
      ];
    } else {
      if (this.lastFrameSurfaceState !== null && lastMovement) {
        // Apply the last movement to the user's velocity
        this.characterVelocity.add(
          lastMovement.position.clone().divideScalar(deltaTime), // The position delta is the result of one tick which is deltaTime seconds, so we need to divide by deltaTime to get the velocity per second
        );
      }
      this.lastFrameSurfaceState = null;
    }
    return lastMovement;
  }

  private updateNetworkState(): void {
    const characterQuaternion = this.config.character.getWorldQuaternion(this.tempQuaternion);
    const cameraQuaternion = new Quaternion();
    this.config.cameraManager.camera.getWorldQuaternion(cameraQuaternion);
    this.networkState = {
      id: this.config.id,
      position: {
        x: this.config.character.position.x,
        y: this.config.character.position.y,
        z: this.config.character.position.z,
      },
      rotation: { quaternionY: characterQuaternion.y, quaternionW: characterQuaternion.w },
      camPosition: {
        x: this.config.cameraManager.camera.position.x,
        y: this.config.cameraManager.camera.position.y,
        z: this.config.cameraManager.camera.position.z,
      },
      camQuaternion: {
        y: cameraQuaternion.y,
        w: cameraQuaternion.w,
      },
      state: this.config.character.getCurrentAnimation(),
    };
  }

  private respawn(): void {
    this.characterVelocity.y = 0;
    this.config.character.position.set(0, 10, 0);
    this.config.character.rotation.set(0, 0, 0);
    this.characterOnGround = false;
    this.doubleJumpUsed = false;
    this.jumpReleased = true;
    this.jumpCounter = 0;
  }

  private resetPosition(): void {
    this.characterVelocity.y = 0;
    this.config.character.position.y = 3;
    this.characterOnGround = false;
    this.doubleJumpUsed = false;
    this.jumpReleased = true;
    this.jumpCounter = 0;
  }
}
