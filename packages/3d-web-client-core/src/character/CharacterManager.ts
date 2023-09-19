import { PositionAndRotation } from "mml-web";
import { Camera, Group, Object3D, PerspectiveCamera, Vector3 } from "three";

import { CameraManager } from "../camera/CameraManager";
import { CollisionsManager } from "../collisions/CollisionsManager";
import { ease, getSpawnPositionInsideCircle } from "../helpers/math-helpers";
import { KeyInputManager } from "../input/KeyInputManager";
import { TimeManager } from "../time/TimeManager";

import { Character, CharacterDescription } from "./Character";
import { AnimationState, CharacterState } from "./CharacterState";
import { RemoteController } from "./RemoteController";

function encodeCharacterAndCamera(character: Object3D, camera: PerspectiveCamera): string {
  return [
    ...character.position.toArray(),
    ...character.quaternion.toArray(),
    ...camera.position.toArray(),
    ...camera.quaternion.toArray(),
  ].join(",");
}

function decodeCharacterAndCamera(hash: string, character: Object3D, camera: Camera) {
  const values = hash.split(",").map(Number);
  character.position.fromArray(values.slice(0, 3));
  character.quaternion.fromArray(values.slice(3, 7));
  camera.position.fromArray(values.slice(7, 10));
  camera.quaternion.fromArray(values.slice(10, 14));
}

export class CharacterManager {
  /*
   TODO - re-enable updating location hash when there is a solution that waits for models to load (currently if the 
    character was standing on a model and the page is reloaded the character falls into the model before it loads and 
    can be trapped).
  */
  private updateLocationHash = false;

  public loadingCharacters: Map<number, Promise<Character>> = new Map();

  public remoteCharacters: Map<number, Character> = new Map();
  public remoteCharacterControllers: Map<number, RemoteController> = new Map();

  private characterDescription: CharacterDescription | null = null;
  public character: Character | null = null;

  private cameraOffsetTarget: number = 0;
  private cameraOffset: number = 0;

  public readonly group: Group;

  constructor(
    private readonly collisionsManager: CollisionsManager,
    private readonly cameraManager: CameraManager,
    private readonly timeManager: TimeManager,
    private readonly inputManager: KeyInputManager,
    private readonly clientStates: Map<number, CharacterState>,
    private readonly sendUpdate: (update: CharacterState) => void,
  ) {
    this.group = new Group();
  }

  /* TODO: 
    1) Separate this method into spawnLocalCharacter and spawnRemoteCharacter
    2) Make this synchronous to avoid having loadingCharacters and instead manage
      the mesh loading async (would allow us to show a nameplate where a remote
      user is before the asset loads).
  */
  public spawnCharacter(
    characterDescription: CharacterDescription,
    id: number,
    isLocal: boolean = false,
    spawnPosition: Vector3 = new Vector3(),
  ) {
    this.characterDescription = characterDescription;
    const characterLoadingPromise = new Promise<Character>((resolve) => {
      const character = new Character(
        characterDescription,
        id,
        isLocal,
        () => {
          if (window.location.hash && window.location.hash.length > 1) {
            decodeCharacterAndCamera(
              window.location.hash.substring(1),
              character.model!.mesh!,
              this.cameraManager.camera,
            );
          } else {
            spawnPosition = getSpawnPositionInsideCircle(3, 30, id, 0.4);
            character.model!.mesh!.position.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);
            character.model!.mesh!.updateMatrixWorld();
            this.sendUpdate({
              id: id,
              position: {
                x: spawnPosition.x,
                y: spawnPosition.y,
                z: spawnPosition.z,
              },
              rotation: { quaternionY: 0, quaternionW: 1 },
              state: AnimationState.idle,
            });
          }
          character.model!.hideMaterialByMeshName("SK_Mannequin_2");
          if (!isLocal) {
            character.model?.mesh?.position.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);
            character.model?.mesh?.updateMatrixWorld();
            character.position.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);
          }
          this.group.add(character.model!.mesh!);

          if (isLocal) {
            this.character = character;
            this.character.tooltip?.setText(`${id}`);
          } else {
            this.remoteCharacters.set(id, character);
            const remoteController = new RemoteController(character, id);
            remoteController.setAnimationFromFile(
              AnimationState.idle,
              characterDescription.idleAnimationFileUrl,
            );
            remoteController.setAnimationFromFile(
              AnimationState.walking,
              characterDescription.jogAnimationFileUrl,
            );
            remoteController.setAnimationFromFile(
              AnimationState.running,
              characterDescription.sprintAnimationFileUrl,
            );
            remoteController.setAnimationFromFile(
              AnimationState.air,
              characterDescription.airAnimationFileUrl,
            );
            remoteController.characterModel?.position.set(
              spawnPosition.x,
              spawnPosition.y,
              spawnPosition.z,
            );
            this.remoteCharacterControllers.set(id, remoteController);
            character.tooltip?.setText(`${id}`);
          }
          resolve(character);
        },
        this.collisionsManager,
        this.inputManager,
        this.cameraManager,
        this.timeManager,
      );
    });

    this.loadingCharacters.set(id, characterLoadingPromise);
    return characterLoadingPromise;
  }

  public getLocalCharacterPositionAndRotation(): PositionAndRotation {
    if (this.character && this.character.model && this.character.model.mesh) {
      return {
        position: this.character.model.mesh.position,
        rotation: this.character.model.mesh.rotation,
      };
    }
    return {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    };
  }

  public clear() {
    for (const [id, character] of this.remoteCharacters) {
      this.group.remove(character.model!.mesh!);
      this.remoteCharacters.delete(id);
      this.remoteCharacterControllers.delete(id);
    }
    if (this.character) {
      this.group.remove(this.character.model!.mesh!);
      this.character = null;
    }
    this.loadingCharacters.clear();
  }

  public update() {
    if (this.character) {
      this.character.update(this.timeManager.time);

      if (this.character.model?.mesh) {
        this.cameraOffsetTarget = this.cameraManager.targetDistance <= 0.4 ? 0.13 : 0;
        this.cameraOffset += ease(this.cameraOffsetTarget, this.cameraOffset, 0.1);
        const targetOffset = new Vector3(0, 1.3, this.cameraOffset);
        targetOffset.applyQuaternion(this.character.model.mesh.quaternion);
        this.cameraManager.setTarget(this.character.position.add(targetOffset));
      }

      if (this.character.controller) {
        this.character.controller.update();
        if (this.timeManager.frame % 2 === 0) {
          this.sendUpdate(this.character.controller.networkState);
        }
      }

      for (const [id, update] of this.clientStates) {
        const { position } = update;
        if (!this.remoteCharacters.has(id) && !this.loadingCharacters.has(id)) {
          this.spawnCharacter(
            this.characterDescription!,
            id,
            false,
            new Vector3(position.x, position.y, position.z),
          ).then((_character) => {
            this.loadingCharacters.delete(id);
          });
        }

        const characterController = this.remoteCharacterControllers.get(id);
        if (characterController) {
          characterController.update(update, this.timeManager.time, this.timeManager.deltaTime);
        }
      }

      for (const [id, character] of this.remoteCharacters) {
        if (!this.clientStates.has(id)) {
          this.group.remove(character.model!.mesh!);
          this.remoteCharacters.delete(id);
          this.remoteCharacterControllers.delete(id);
        }
      }

      if (this.updateLocationHash && this.timeManager.frame % 60 === 0) {
        window.location.hash = encodeCharacterAndCamera(
          this.character.model!.mesh!,
          this.cameraManager.camera,
        );
      }
    }
  }
}
