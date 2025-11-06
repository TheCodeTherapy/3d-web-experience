import { PositionAndRotation, radToDeg } from "@mml-io/mml-web";
import { Euler, Group, Quaternion, Vector3 } from "three";

import { CameraManager } from "../camera/CameraManager";
import { CollisionsManager } from "../collisions/CollisionsManager";
import { KeyInputManager } from "../input/KeyInputManager";
import { VirtualJoystick } from "../input/VirtualJoystick";
import { Composer } from "../rendering/composer";
import { TimeManager } from "../time/TimeManager";
import { TweakPane } from "../tweakpane/TweakPane";

import { Character, CharacterDescription, LoadedAnimations } from "./Character";
import { colorArrayToColors } from "./CharacterModel";
import { AnimationState, CharacterState } from "./CharacterState";
import { CharacterInstances } from "./instancing/CharacterInstances";
import { CharacterModelLoader } from "./loading/CharacterModelLoader";
import { LocalController } from "./LocalController";
import { RemoteController } from "./RemoteController";
import { encodeCharacterAndCamera } from "./url-position";

type SpawnPosition = {
  x: number;
  y: number;
  z: number;
};

type SpawnPositionVariance = {
  x: number;
  y: number;
  z: number;
};

type RespawnTrigger = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export type SpawnConfiguration = {
  spawnPosition?: Partial<SpawnPosition>;
  spawnPositionVariance?: Partial<SpawnPositionVariance>;
  spawnYRotation?: number;
  respawnTrigger?: Partial<RespawnTrigger>;
  enableRespawnButton?: boolean;
};

export type SpawnConfigurationState = {
  spawnPosition: SpawnPosition;
  spawnPositionVariance: SpawnPositionVariance;
  spawnYRotation: number;
  respawnTrigger: RespawnTrigger;
  enableRespawnButton: boolean;
};

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
  sendLocalCharacterColors: (colors: Array<[number, number, number]>) => void;
  animationsPromise: Promise<LoadedAnimations>;
  spawnConfiguration: SpawnConfigurationState;
  characterResolve: (clientId: number) => {
    username: string | null;
    characterDescription: CharacterDescription | null;
    colors: Array<[number, number, number]> | null;
  };
  updateURLLocation?: boolean;
};

type LoadedCharacterState = {
  character: Character;
  remoteController: RemoteController;
  characterLoaded: boolean;
};

type RemoteCharacterState = {
  id: number;
  loadedCharacterState: LoadedCharacterState | null;
  lastPosition: { x: number; y: number; z: number };
  distanceSquared: number;
  lastLODChange: number; // timestamp of last promotion/demotion
  abortController?: AbortController; // For cancelling loading operations
};

type CharacterReadyForScene = {
  id: number;
  character: Character;
  remoteController: RemoteController;
};

export class CharacterManager {
  public static readonly headTargetOffset = new Vector3(0, 1.75, 0);

  private localClientId: number = 0;

  public remoteCharacters: Map<number, RemoteCharacterState> = new Map();

  public localController: LocalController;
  public localCharacter: Character | null = null;
  public characterInstances: CharacterInstances | null = null;

  public readonly group: Group;
  private lastUpdateSentTime: number = 0;

  private readonly MAX_REAL_REMOTE_CHARACTERS = 30;
  private readonly LOD_CHANGE_COOLDOWN_MS = 2000;
  private readonly MAX_SCENE_ADDITIONS_PER_FRAME = 3;

  private pendingSpawns = new Set<number>();
  // Track characters that are loading to keep instances visible
  private loadingCharacters = new Set<number>();
  // Queue for characters ready to be added to the scene (throttled)
  private charactersReadyForScene: CharacterReadyForScene[] = [];

  constructor(private config: CharacterManagerConfig) {
    this.group = new Group();
    this.initializeCharacterInstances();
  }

  public spawnLocalCharacter(
    id: number,
    username: string,
    characterDescription: CharacterDescription | null,
    spawnPosition: Vector3 = new Vector3(),
    spawnRotation: Euler = new Euler(),
  ) {
    const character = new Character({
      username,
      characterDescription,
      animationsPromise: this.config.animationsPromise,
      characterModelLoader: this.config.characterModelLoader,
      characterId: id,
      modelLoadedCallback: () => {
        this.config.sendLocalCharacterColors(character.getColors());
      },
      modelLoadFailedCallback: (error: Error) => {
        console.error(`CharacterManager: Local character ${id} model failed to load:`, error);
      },
      cameraManager: this.config.cameraManager,
      composer: this.config.composer,
      isLocal: true,
    });
    const quaternion = character.quaternion;
    this.config.sendUpdate({
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
      spawnConfiguration: this.config.spawnConfiguration,
    });
    this.localCharacter.position.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    const spawnQuat = new Quaternion().setFromEuler(spawnRotation);
    this.localCharacter.quaternion.set(spawnQuat.x, spawnQuat.y, spawnQuat.z, spawnQuat.w);
    this.group.add(character);
  }

  private calculateDistanceSquared(position: { x: number; y: number; z: number }): number {
    if (!this.localCharacter) return Number.MAX_VALUE;
    const localPos = this.localCharacter.position;
    const dx = position.x - localPos.x;
    const dy = position.y - localPos.y;
    const dz = position.z - localPos.z;
    return dx * dx + dy * dy + dz * dz;
  }

  private evaluateLOD(): void {
    for (const [, char] of this.remoteCharacters) {
      char.distanceSquared = this.calculateDistanceSquared(char.lastPosition);
    }

    const sortedChars = Array.from(this.remoteCharacters.values());
    sortedChars.sort((a, b) => a.distanceSquared - b.distanceSquared);

    const now = Date.now();
    for (let i = 0; i < sortedChars.length; i++) {
      const char = sortedChars[i];
      const shouldBe = i < this.MAX_REAL_REMOTE_CHARACTERS;

      const loadedCharacter = char.loadedCharacterState;
      const isLoading = this.loadingCharacters.has(char.id);
      const isReal = loadedCharacter !== null || isLoading;

      if (isReal !== shouldBe) {
        const timeSinceLastChange = now - char.lastLODChange;
        if (timeSinceLastChange < this.LOD_CHANGE_COOLDOWN_MS) {
          continue;
        }

        if (shouldBe) {
          char.lastLODChange = now;
          this.promoteToReal(char.id);
        } else {
          // Only demote if character is not currently loading
          char.lastLODChange = now;
          this.demoteToInstance(char.id);
        }
      }
    }
  }

  private promoteToReal(id: number): void {
    const networkState = this.config.remoteUserStates.get(id);
    if (!networkState) {
      console.error(`CharacterManager: Cannot promote character ${id}: no network state`);
      return;
    }

    // mark character as loading and update active character state
    this.loadingCharacters.add(id);
    const remoteChar = this.remoteCharacters.get(id);
    if (!remoteChar) {
      throw new Error(
        `CharacterManager: Cannot promote character ${id}: not found in remoteCharacters`,
      );
    }

    // Create AbortController for this loading operation
    const abortController = new AbortController();
    remoteChar.abortController = abortController;

    const characterInfo = this.config.characterResolve(id);
    let position = new Vector3(
      networkState.position.x,
      networkState.position.y,
      networkState.position.z,
    );
    const instancePosition = this.characterInstances?.getPositionForInstance(id);
    if (instancePosition) {
      position = instancePosition;
    }
    const euler = new Euler().setFromQuaternion(
      new Quaternion(0, networkState.rotation.quaternionY, 0, networkState.rotation.quaternionW),
    );
    const rotation = new Euler(euler.x, euler.y, euler.z);

    const character = new Character({
      username: characterInfo.username ?? `Unknown User ${id}`,
      characterDescription: characterInfo.characterDescription,
      animationsPromise: this.config.animationsPromise,
      characterModelLoader: this.config.characterModelLoader,
      characterId: id,
      modelLoadedCallback: () => {
        // Check if operation was canceled during loading
        if (abortController.signal.aborted) {
          console.log(`CharacterManager: Character ${id} loading was canceled`);
          return;
        }

        const loadedCharacterState = remoteChar.loadedCharacterState;
        if (!loadedCharacterState) {
          console.warn("CharacterManager: No loadedCharacterState found for character", id);
          return;
        }

        const networkState = this.config.remoteUserStates.get(id);
        if (networkState) {
          remoteController.update(
            networkState,
            this.config.timeManager.time,
            this.config.timeManager.deltaTime,
          );
        }

        loadedCharacterState.characterLoaded = true;

        // Called when the real character has finished loading
        // Mark as loaded and clear abort controller
        this.loadingCharacters.delete(id);
        remoteChar.abortController = undefined;

        // Add to queue for throttled scene addition
        this.charactersReadyForScene.push({
          id,
          character,
          remoteController,
        });

        // Shadow the instance instead of removing it completely
        if (this.characterInstances) {
          this.characterInstances.shadowInstance(id);
        }
      },
      modelLoadFailedCallback: (error: Error) => {
        // Check if operation was canceled during loading
        if (abortController.signal.aborted) {
          console.log(`CharacterManager: Character ${id} loading was canceled`);
          return;
        }

        console.warn(
          `CharacterManager: Character ${id} model failed to load, keeping instance visible`,
        );

        // Clean up the failed character state
        this.loadingCharacters.delete(id);
        remoteChar.abortController = undefined;

        // Remove the failed character from the scene if it was added
        if (remoteChar.loadedCharacterState?.character.parent) {
          this.group.remove(remoteChar.loadedCharacterState.character);
        }

        // Dispose of the failed character
        remoteChar.loadedCharacterState?.character.dispose();
        remoteChar.loadedCharacterState = null;

        // Instance remains visible and character can be promoted again later
        // The instance was never shadowed since the modelLoadedCallback was never called
      },
      cameraManager: this.config.cameraManager,
      composer: this.config.composer,
      isLocal: false,
      abortController,
    });

    const spawnQuaternion = new Quaternion().setFromEuler(rotation);
    character.position.set(position.x, position.y, position.z);
    character.quaternion.set(
      spawnQuaternion.x,
      spawnQuaternion.y,
      spawnQuaternion.z,
      spawnQuaternion.w,
    );
    // Character will be added to scene when processed from queue
    const remoteController = new RemoteController(character);
    remoteChar.loadedCharacterState = {
      character,
      remoteController,
      characterLoaded: false,
    };
  }

  private demoteToInstance(id: number): void {
    const networkState = this.config.remoteUserStates.get(id);
    if (!networkState) return;

    const wasLoading = this.loadingCharacters.has(id);
    this.loadingCharacters.delete(id);

    const activeChar = this.remoteCharacters.get(id);
    if (!activeChar) {
      throw new Error(
        `CharacterManager: Cannot demote character ${id}: not found in remoteCharacters`,
      );
    }

    // Cancel the loading operation if it's still in progress
    if (activeChar.abortController && wasLoading) {
      console.log(`CharacterManager: Cancelling loading for character ${id} during demotion`);
      activeChar.abortController.abort();
      activeChar.abortController = undefined;
    }

    // Remove from scene queue if present (character might be queued but not yet added to scene)
    const queueIndex = this.charactersReadyForScene.findIndex((c) => c.id === id);
    if (queueIndex !== -1) {
      this.charactersReadyForScene.splice(queueIndex, 1);
    }

    const loadedCharacterState = activeChar.loadedCharacterState;
    if (!loadedCharacterState) {
      if (wasLoading) {
        console.log(`CharacterManager: Character ${id} loading was canceled successfully`);
      } else {
        console.warn(
          `CharacterManager: Cannot demote character ${id}: no character instance found`,
        );
      }
      return;
    }
    if (!loadedCharacterState.characterLoaded) {
      console.warn(
        `CharacterManager: Demoting character ${id} that is not fully loaded (wasLoading: ${wasLoading})`,
      );
    }

    // Capture the real character's current position before removing it
    const realCharacterPosition = new Vector3(
      loadedCharacterState.character.position.x,
      loadedCharacterState.character.position.y,
      loadedCharacterState.character.position.z,
    );
    const realCharacterRotation = new Euler().setFromQuaternion(
      new Quaternion(
        loadedCharacterState.character.quaternion.x,
        loadedCharacterState.character.quaternion.y,
        loadedCharacterState.character.quaternion.z,
        loadedCharacterState.character.quaternion.w,
      ),
    );

    this.group.remove(loadedCharacterState.character);
    loadedCharacterState.character.dispose();
    activeChar.loadedCharacterState = null;

    if (this.characterInstances) {
      // First try to unshadow an existing instance
      this.characterInstances.unshadowInstance(id);

      // Use the real character's position to immediately position the unshadowed instance
      this.characterInstances.setInstancePositionImmediate(
        id,
        realCharacterPosition,
        realCharacterRotation,
        networkState.state,
      );
    }
  }

  public setupTweakPane(tweakPane: TweakPane) {
    tweakPane.setupCharacterController(this.localController);
  }

  private async initializeCharacterInstances() {
    try {
      const characterInstances = new CharacterInstances({
        animationsPromise: this.config.animationsPromise,
        characterModelLoader: this.config.characterModelLoader,
        cameraManager: this.config.cameraManager,
        timeManager: this.config.timeManager,
        debug: false,
      });

      const instancedMesh = await characterInstances.initialize();
      if (instancedMesh) {
        this.group.add(instancedMesh);
        characterInstances.setupFrustumCulling();
        this.characterInstances = characterInstances;
      } else {
        console.error("failed to initialize character instances");
      }
    } catch (error) {
      console.error("error initializing instances:", error);
    }
  }

  public getLocalCharacterPositionAndRotation(): PositionAndRotation {
    if (this.localCharacter && this.localCharacter && this.localCharacter) {
      const rotation = this.localCharacter.rotation;
      return {
        position: this.localCharacter.position,
        rotation: {
          x: radToDeg(rotation.x),
          y: radToDeg(rotation.y),
          z: radToDeg(rotation.z),
        },
      };
    }
    return {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    };
  }

  public clear() {
    for (const [id, remoteCharacter] of this.remoteCharacters) {
      // Cancel any ongoing loading operations
      if (remoteCharacter.abortController) {
        console.log(`CharacterManager: Cancelling loading for character ${id} during clear`);
        remoteCharacter.abortController.abort();
      }

      const loadedCharacterState = remoteCharacter.loadedCharacterState;
      if (loadedCharacterState) {
        this.group.remove(loadedCharacterState.character);
      }
      this.remoteCharacters.delete(id);
    }

    if (this.localCharacter) {
      this.group.remove(this.localCharacter);
      this.localCharacter = null;
    }
    if (this.characterInstances) {
      this.characterInstances.clear();
    }

    this.pendingSpawns.clear();
    this.loadingCharacters.clear(); // Clean up loading state
    this.charactersReadyForScene.length = 0; // Clear the queue
  }

  public dispose() {
    this.clear();
    if (this.characterInstances) {
      this.characterInstances.dispose();
      this.characterInstances = null;
    }
    if (this.localCharacter) {
      this.localCharacter.dispose();
      this.localCharacter = null;
    }
  }

  public addSelfChatBubble(message: string) {
    if (this.localCharacter) {
      this.localCharacter.addChatBubble(message);
    }
  }

  public addChatBubble(id: number, message: string) {
    this.remoteCharacters.get(id)?.loadedCharacterState?.character?.addChatBubble(message);
  }

  public networkCharacterInfoUpdated(id: number) {
    const characterInfo = this.config.characterResolve(id);
    const colors = colorArrayToColors(characterInfo.colors ?? []);

    if (this.localCharacter && this.localClientId == id) {
      const abortController = new AbortController();
      const localCharacter = this.localCharacter;
      this.localCharacter.updateCharacter(
        characterInfo.username ?? `Unknown User ${id}`,
        characterInfo.characterDescription,
        abortController,
        () => {
          if (abortController.signal.aborted) {
            return;
          }
          this.config.sendLocalCharacterColors(localCharacter.getColors());
        },
        (error) => {
          console.error("local.modelLoadFailedCallback", id, error);
        },
      );
    }

    const remoteCharacter = this.remoteCharacters.get(id);
    if (remoteCharacter) {
      if (remoteCharacter.loadedCharacterState) {
        const abortController = new AbortController();
        remoteCharacter.loadedCharacterState.character.updateCharacter(
          characterInfo.username ?? `Unknown User ${id}`,
          characterInfo.characterDescription,
          abortController,
          () => {
            if (abortController.signal.aborted) {
              return;
            }
          },
          (error) => {
            console.error("remote.modelLoadFailedCallback", id, error);
          },
        );
        remoteCharacter.abortController = abortController;
      }
      if (this.characterInstances) {
        this.characterInstances.updateInstanceColors(id, colors);
      }
    }
  }

  public update() {
    // Process queue of characters ready to be added to scene (throttled)
    const charactersToAdd = this.charactersReadyForScene.splice(
      0,
      this.MAX_SCENE_ADDITIONS_PER_FRAME,
    );
    for (const { character } of charactersToAdd) {
      this.group.add(character);
    }

    if (this.localCharacter) {
      this.localCharacter.update(this.config.timeManager.time, this.config.timeManager.deltaTime);

      this.localController.update();

      if (this.characterInstances) {
        this.characterInstances.update(
          this.config.timeManager.deltaTime,
          this.config.timeManager.time,
        );
      }

      const currentTime = new Date().getTime();
      const timeSinceLastUpdate = currentTime - this.lastUpdateSentTime;
      if (timeSinceLastUpdate > 30) {
        this.lastUpdateSentTime = currentTime;
        this.config.sendUpdate(this.localController.networkState);
      }

      const targetOffset = new Vector3();
      targetOffset
        .add(CharacterManager.headTargetOffset)
        .applyQuaternion(
          new Quaternion(
            this.localCharacter.quaternion.x,
            this.localCharacter.quaternion.y,
            this.localCharacter.quaternion.z,
            this.localCharacter.quaternion.w,
          ),
        )
        .add(this.localCharacter.position);
      this.config.cameraManager.setTarget(targetOffset);

      if (!this.localCharacter) {
        console.warn("CharacterManager: Local character not spawned yet, skipping update");
        return;
      }

      const characterInstances = this.characterInstances;
      if (!characterInstances) {
        console.warn("CharacterManager: CharacterInstances not initialized, skipping update");
        return;
      }

      for (const [id, update] of this.config.remoteUserStates) {
        if (id === this.localClientId) {
          continue;
        }

        const { position } = update;
        const currentPosition = { x: position.x, y: position.y, z: position.z };
        let existingCharacter = this.remoteCharacters.get(id);
        if (!existingCharacter) {
          existingCharacter = {
            id,
            loadedCharacterState: null,
            lastPosition: { ...currentPosition },
            distanceSquared: this.calculateDistanceSquared(position),
            lastLODChange: 0,
            abortController: undefined,
          };
          this.remoteCharacters.set(id, existingCharacter);

          this.pendingSpawns.add(id);

          const characterInfo = this.config.characterResolve(id);

          // Convert characterInfo colors to Map<string, Color> format
          const colorMap = colorArrayToColors(characterInfo.colors ?? []);

          const euler = new Euler().setFromQuaternion(
            new Quaternion(0, update.rotation.quaternionY, 0, update.rotation.quaternionW),
          );
          const rotation = new Euler(euler.x, euler.y, euler.z);

          characterInstances.spawnInstance(
            id,
            colorMap,
            new Vector3(position.x, position.y, position.z),
            rotation,
            update.state,
          );
        } else {
          existingCharacter.lastPosition = { ...position };
          const euler = new Euler().setFromQuaternion(
            new Quaternion(0, update.rotation.quaternionY, 0, update.rotation.quaternionW),
          );
          const loadedCharacterState = existingCharacter.loadedCharacterState;
          if (loadedCharacterState) {
            // Update real character
            const character = loadedCharacterState.character;
            if (!loadedCharacterState.characterLoaded) {
              characterInstances.updateInstance(
                id,
                new Vector3(position.x, position.y, position.z),
                new Euler(euler.x, euler.y, euler.z),
                update.state,
              );
            }
            const characterController = loadedCharacterState.remoteController;
            characterController.update(
              update,
              this.config.timeManager.time,
              this.config.timeManager.deltaTime,
            );

            if (character && character.getCurrentAnimation() !== update.state) {
              character.updateAnimation(update.state);
            }
          } else {
            characterInstances.updateInstance(
              id,
              new Vector3(position.x, position.y, position.z),
              new Euler(euler.x, euler.y, euler.z),
              update.state,
            );
          }
        }
      }

      for (const [, activeChar] of this.remoteCharacters) {
        if (!this.config.remoteUserStates.has(activeChar.id)) {
          // Cancel any ongoing loading operations for disconnected characters
          if (activeChar.abortController) {
            activeChar.abortController.abort();
          }

          const loadedCharacterState = activeChar.loadedCharacterState;
          if (loadedCharacterState) {
            this.group.remove(loadedCharacterState.character);
          }

          // Clean up both regular instances and shadowed instances
          characterInstances.despawnInstance(activeChar.id);

          // Clean up loading state to prevent memory leaks
          this.loadingCharacters.delete(activeChar.id);
          this.remoteCharacters.delete(activeChar.id);
        }
      }
    }

    for (const pendingId of [...this.pendingSpawns]) {
      if (!this.config.remoteUserStates.has(pendingId)) {
        this.pendingSpawns.delete(pendingId);
        this.loadingCharacters.delete(pendingId); // Clean up loading state
      }
    }

    // Clean up characters in the ready-for-scene queue if they've disconnected
    this.charactersReadyForScene = this.charactersReadyForScene.filter(({ id }) => {
      return this.config.remoteUserStates.has(id);
    });

    this.evaluateLOD();

    if (
      this.localCharacter &&
      this.config.updateURLLocation &&
      this.config.timeManager.frame % 60 === 0 &&
      document.hasFocus() &&
      /*
         Don't update the URL if the camera is being controlled as some browsers (e.g. Chrome) cause a hitch to Pointer
         events when the url is updated
        */
      !this.config.cameraManager.hasActiveInput()
    ) {
      const hash = encodeCharacterAndCamera(this.localCharacter, this.config.cameraManager.camera);
      const url = new URL(window.location.href);
      url.hash = hash;
      window.history.replaceState({}, "", url);
    }
  }
}
