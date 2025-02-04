import { PositionAndRotation } from "@mml-io/mml-web";
import { Euler, Group, Quaternion, Vector3 } from "three";

import { CameraManager } from "../camera/CameraManager";
import { CollisionsManager } from "../collisions/CollisionsManager";
import { KeyInputManager } from "../input/KeyInputManager";
import { VirtualJoystick } from "../input/VirtualJoystick";
import { Composer } from "../rendering/composer";
import { TimeManager } from "../time/TimeManager";
import { TweakPane } from "../tweakpane/TweakPane";

import { AnimationConfig, Character, CharacterDescription } from "./Character";
import { CharacterModelLoader } from "./CharacterModelLoader";
import { AnimationState, CharacterState } from "./CharacterState";
import { LocalController } from "./LocalController";
import { RemoteController } from "./RemoteController";
import { encodeCharacterAndCamera } from "./url-position";

export type CharacterManagerConfig = {
  composer: Composer;
  characterModelLoader: CharacterModelLoader;
  collisionsManager: CollisionsManager;
  cameraManager: CameraManager;
  timeManager: TimeManager;
  keyInputManager: KeyInputManager;
  virtualJoystick?: VirtualJoystick;
  remoteUserStates: Map<number, CharacterState>;
  sendUpdate: (update: CharacterState) => void;
  animationConfig: AnimationConfig;
  characterResolve: (clientId: number) => {
    username: string;
    characterDescription: CharacterDescription;
  };
  updateURLLocation?: boolean;
};

export class CharacterManager {
  public readonly headTargetOffset = new Vector3(0, 1.3, 0);

  private localClientId: number = 0;

  public remoteCharacters: Map<number, Character> = new Map();
  public remoteCharacterControllers: Map<number, RemoteController> = new Map();

  private localCharacterSpawned: boolean = false;
  public localController: LocalController;
  public localCharacter: Character | null = null;

  private speakingCharacters: Map<number, boolean> = new Map();

  public readonly group: Group;
  private lastUpdateSentTime: number = 0;

  constructor(private config: CharacterManagerConfig) {
    this.group = new Group();
  }

  public spawnLocalCharacter(
    id: number,
    username: string,
    characterDescription: CharacterDescription,
    spawnPosition: Vector3 = new Vector3(),
    spawnRotation: Euler = new Euler(),
  ) {
    const character = new Character({
      username,
      characterDescription,
      animationConfig: this.config.animationConfig,
      characterModelLoader: this.config.characterModelLoader,
      characterId: id,
      modelLoadedCallback: () => {
        // character loaded callback
      },
      cameraManager: this.config.cameraManager,
      composer: this.config.composer,
      isLocal: true,
    });
    const quaternion = new Quaternion().setFromEuler(character.rotation);
    this.config.sendUpdate({
      id: id,
      position: {
        x: spawnPosition.x,
        y: spawnPosition.y,
        z: spawnPosition.z,
      },
      rotation: { quaternionY: quaternion.y, quaternionW: quaternion.w },
      state: AnimationState.idle,
    });
    this.localClientId = id;
    this.localCharacter = character;
    this.localController = new LocalController({
      character: this.localCharacter,
      id: this.localClientId,
      collisionsManager: this.config.collisionsManager,
      keyInputManager: this.config.keyInputManager,
      virtualJoystick: this.config.virtualJoystick,
      cameraManager: this.config.cameraManager,
      timeManager: this.config.timeManager,
    });
    this.localCharacter.position.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    this.localCharacter.rotation.set(spawnRotation.x, spawnRotation.y, spawnRotation.z);
    this.group.add(character);
    this.localCharacterSpawned = true;
  }

  public setupTweakPane(tweakPane: TweakPane) {
    tweakPane.setupCharacterController(this.localController);
  }

  public spawnRemoteCharacter(
    id: number,
    username: string,
    characterDescription: CharacterDescription,
    spawnPosition: Vector3 = new Vector3(),
    spawnRotation: Euler = new Euler(),
  ) {
    const character = new Character({
      username,
      characterDescription,
      animationConfig: this.config.animationConfig,
      characterModelLoader: this.config.characterModelLoader,
      characterId: id,
      modelLoadedCallback: () => {
        // character loaded callback
      },
      cameraManager: this.config.cameraManager,
      composer: this.config.composer,
      isLocal: false,
    });

    this.remoteCharacters.set(id, character);
    character.position.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    character.rotation.set(spawnRotation.x, spawnRotation.y, spawnRotation.z);
    const remoteController = new RemoteController({ character, id });
    this.remoteCharacterControllers.set(id, remoteController);
    this.group.add(character);
  }

  public getLocalCharacterPositionAndRotation(): PositionAndRotation {
    if (this.localCharacter && this.localCharacter && this.localCharacter) {
      return {
        position: this.localCharacter.position,
        rotation: this.localCharacter.rotation,
      };
    }
    return {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    };
  }

  public clear() {
    for (const [id, character] of this.remoteCharacters) {
      this.group.remove(character);
      this.remoteCharacters.delete(id);
      this.remoteCharacterControllers.delete(id);
    }
    if (this.localCharacter) {
      this.group.remove(this.localCharacter);
      this.localCharacter = null;
    }
  }

  public setSpeakingCharacter(id: number, value: boolean) {
    this.speakingCharacters.set(id, value);
  }

  public addSelfChatBubble(message: string) {
    if (this.localCharacter) {
      this.localCharacter.addChatBubble(message);
    }
  }

  public addChatBubble(id: number, message: string) {
    this.remoteCharacters.get(id)?.addChatBubble(message);
  }

  public respawnIfPresent(id: number) {
    const characterInfo = this.config.characterResolve(id);

    if (this.localCharacter && this.localClientId == id) {
      this.localCharacter.updateCharacter(
        characterInfo.username,
        characterInfo.characterDescription,
      );
    }

    const remoteCharacter = this.remoteCharacters.get(id);
    if (remoteCharacter) {
      remoteCharacter.updateCharacter(characterInfo.username, characterInfo.characterDescription);
    }
  }

  public update() {
    if (this.localCharacter) {
      this.localCharacter.update(this.config.timeManager.time, this.config.timeManager.deltaTime);
      if (this.speakingCharacters.has(this.localClientId)) {
        this.localCharacter.speakingIndicator?.setSpeaking(
          this.speakingCharacters.get(this.localClientId)!,
        );
      }

      this.localController.update();
      const currentTime = new Date().getTime();
      const timeSinceLastUpdate = currentTime - this.lastUpdateSentTime;
      if (timeSinceLastUpdate > 30) {
        // Limit updates to per 30ms
        this.lastUpdateSentTime = currentTime;
        this.config.sendUpdate(this.localController.networkState);
      }

      const targetOffset = new Vector3();
      targetOffset
        .add(this.headTargetOffset)
        .applyQuaternion(this.localCharacter.quaternion)
        .add(this.localCharacter.position);
      this.config.cameraManager.setTarget(targetOffset);

      for (const [id, update] of this.config.remoteUserStates) {
        if (this.remoteCharacters.has(id) && this.speakingCharacters.has(id)) {
          const character = this.remoteCharacters.get(id);
          character?.speakingIndicator?.setSpeaking(this.speakingCharacters.get(id)!);
        }
        const { position } = update;

        if (!this.remoteCharacters.has(id) && this.localCharacterSpawned === true) {
          const characterInfo = this.config.characterResolve(id);
          this.spawnRemoteCharacter(
            id,
            characterInfo.username,
            characterInfo.characterDescription,
            new Vector3(position.x, position.y, position.z),
          );
        }

        const characterController = this.remoteCharacterControllers.get(id);
        if (characterController) {
          characterController.update(
            update,
            this.config.timeManager.time,
            this.config.timeManager.deltaTime,
          );
        }
      }

      for (const [id, character] of this.remoteCharacters) {
        if (!this.config.remoteUserStates.has(id)) {
          character.speakingIndicator?.dispose();
          this.group.remove(character);
          this.remoteCharacters.delete(id);
          this.remoteCharacterControllers.delete(id);
        }
      }

      if (
        this.config.updateURLLocation &&
        this.config.timeManager.frame % 60 === 0 &&
        document.hasFocus() &&
        /*
         Don't update the URL if the camera is being controlled as some browsers (e.g. Chrome) cause a hitch to Pointer
         events when the url is updated
        */
        !this.config.cameraManager.hasActiveInput()
      ) {
        const hash = encodeCharacterAndCamera(
          this.localCharacter,
          this.config.cameraManager.camera,
        );
        const url = new URL(window.location.href);
        url.hash = hash;
        window.history.replaceState({}, "", url);
      }
    }
  }
}
