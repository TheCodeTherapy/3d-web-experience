import {
  AnimationConfig,
  CameraManager,
  CharacterDescription,
  CharacterManager,
  CharacterModelLoader,
  CharacterState,
  CollisionsManager,
  Composer,
  EnvironmentConfiguration,
  ErrorScreen,
  GroundPlane,
  Key,
  KeyInputManager,
  LoadingScreen,
  LoadingScreenConfig,
  MMLCompositionScene,
  TimeManager,
  toggleCameraKey,
  TweakPane,
  SpawnConfiguration,
  SpawnConfigurationState,
  VirtualJoystick,
  Character,
  getSpawnData,
} from "@mml-io/3d-web-client-core";
import {
  FROM_SERVER_CHAT_MESSAGE_TYPE,
  FROM_CLIENT_CHAT_MESSAGE_TYPE,
  ClientChatMessage,
  UserData,
  UserNetworkingClient,
  UserNetworkingClientUpdate,
  WebsocketStatus,
  parseServerChatMessage,
  DeltaNetV01ServerErrors,
  NetworkUpdate,
  SERVER_BROADCAST_MESSAGE_TYPE,
  ServerBroadcastMessage,
  parseServerBroadcastMessage,
} from "@mml-io/3d-web-user-networking";
import {
  IMMLScene,
  LoadingProgressManager,
  MMLNetworkSource,
  NetworkedDOMWebsocketStatus,
  registerCustomElementsToWindow,
  setGlobalDocumentTimeManager,
  setGlobalMMLScene,
} from "@mml-io/mml-web";
import { Scene, AudioListener, Vector3, Quaternion, Euler } from "three";

import { AvatarSelectionUI, AvatarConfiguration } from "./avatar-selection-ui";
import { StringToHslOptions, TextChatUI, TextChatUIProps } from "./chat-ui";
import styles from "./Networked3dWebExperience.module.css";

type MMLDocumentConfiguration = {
  url: string;
  position?: {
    x: number;
    y: number;
    z: number;
  };
  rotation?: {
    x: number;
    y: number;
    z: number;
  };
  scale?: {
    x: number;
    y: number;
    z: number;
  };
  passAuthToken?: boolean;
};

type MMLDocumentState = {
  docRef: unknown;
  loadingProgressManager: LoadingProgressManager;
  config: MMLDocumentConfiguration;
  source: MMLNetworkSource;
  dispose: () => void;
};

export type Networked3dWebExperienceClientConfig = {
  userNetworkAddress: string;
  sessionToken: string;
  authToken?: string | null;
  chatVisibleByDefault?: boolean;
  userNameToColorOptions?: StringToHslOptions;
  animationConfig: AnimationConfig;
  voiceChatAddress?: string;
  updateURLLocation?: boolean;
  onServerBroadcast?: (broadcast: ServerBroadcastMessage) => void;
  loadingScreen?: LoadingScreenConfig;
} & UpdatableConfig;

export type UpdatableConfig = {
  enableChat?: boolean;
  mmlDocuments?: { [key: string]: MMLDocumentConfiguration };
  environmentConfiguration?: EnvironmentConfiguration;
  spawnConfiguration?: SpawnConfiguration;
  avatarConfiguration?: AvatarConfiguration;
  allowCustomDisplayName?: boolean;
  enableTweakPane?: boolean;
  allowOrbitalCamera?: boolean;
  postProcessingEnabled?: boolean;
};

function normalizeSpawnConfiguration(spawnConfig?: SpawnConfiguration): SpawnConfigurationState {
  return {
    spawnPosition: {
      x: spawnConfig?.spawnPosition?.x ?? 0,
      y: spawnConfig?.spawnPosition?.y ?? 0,
      z: spawnConfig?.spawnPosition?.z ?? 0,
    },
    spawnPositionVariance: {
      x: spawnConfig?.spawnPositionVariance?.x ?? 0,
      y: spawnConfig?.spawnPositionVariance?.y ?? 0,
      z: spawnConfig?.spawnPositionVariance?.z ?? 0,
    },
    spawnYRotation: spawnConfig?.spawnYRotation ?? 0,
    respawnTrigger: {
      minX: spawnConfig?.respawnTrigger?.minX ?? Number.NEGATIVE_INFINITY,
      maxX: spawnConfig?.respawnTrigger?.maxX ?? Number.POSITIVE_INFINITY,
      minY: spawnConfig?.respawnTrigger?.minY ?? -100,
      maxY: spawnConfig?.respawnTrigger?.maxY ?? Number.POSITIVE_INFINITY,
      minZ: spawnConfig?.respawnTrigger?.minZ ?? Number.NEGATIVE_INFINITY,
      maxZ: spawnConfig?.respawnTrigger?.maxZ ?? Number.POSITIVE_INFINITY,
    },
    enableRespawnButton: spawnConfig?.enableRespawnButton ?? false,
  };
}

export class Networked3dWebExperienceClient {
  private element: HTMLDivElement;
  private canvasHolder: HTMLDivElement;

  private scene: Scene = new Scene();
  private composer: Composer;
  private tweakPane: TweakPane | null = null;
  private audioListener = new AudioListener();

  private cameraManager: CameraManager;

  private collisionsManager: CollisionsManager;

  private characterModelLoader: CharacterModelLoader;
  private characterManager: CharacterManager;

  private timeManager = new TimeManager();

  private keyInputManager = new KeyInputManager();
  private virtualJoystick: VirtualJoystick;

  private mmlCompositionScene: MMLCompositionScene;
  private mmlDocumentStates: { [key: string]: MMLDocumentState } = {};

  private clientId: number | null = null;
  private networkClient: UserNetworkingClient;
  private remoteUserStates = new Map<number, UserNetworkingClientUpdate>();
  private userProfiles = new Map<number, UserData>();

  private textChatUI: TextChatUI | null = null;

  private avatarSelectionUI: AvatarSelectionUI | null = null;

  private readonly latestCharacterObject = {
    characterState: null as null | CharacterState,
  };
  private characterControllerPaneSet: boolean = false;

  private spawnConfiguration: SpawnConfigurationState;

  private initialLoadCompleted = false;
  private loadingProgressManager = new LoadingProgressManager();
  private loadingScreen: LoadingScreen;
  private errorScreen?: ErrorScreen;
  private groundPlane: GroundPlane | null = null;
  private respawnButton: HTMLDivElement | null = null;

  private currentRequestAnimationFrame: number | null = null;

  constructor(
    private holderElement: HTMLElement,
    private config: Networked3dWebExperienceClientConfig,
  ) {
    this.element = document.createElement("div");
    this.element.style.position = "absolute";
    this.element.style.width = "100%";
    this.element.style.height = "100%";
    this.holderElement.appendChild(this.element);

    document.addEventListener("mousedown", () => {
      if (this.audioListener.context.state === "suspended") {
        this.audioListener.context.resume();
      }
    });

    this.canvasHolder = document.createElement("div");
    this.canvasHolder.style.position = "absolute";
    this.canvasHolder.style.width = "100%";
    this.canvasHolder.style.height = "100%";
    this.element.appendChild(this.canvasHolder);

    this.collisionsManager = new CollisionsManager(this.scene);
    this.cameraManager = new CameraManager(this.canvasHolder, this.collisionsManager);
    // Add audioListener to scene instead of camera for character head positioning
    this.scene.add(this.audioListener);
    this.characterModelLoader = new CharacterModelLoader();

    this.virtualJoystick = new VirtualJoystick(this.element, {
      radius: 70,
      innerRadius: 20,
      mouseSupport: false,
    });

    this.composer = new Composer({
      scene: this.scene,
      cameraManager: this.cameraManager,
      spawnSun: true,
      environmentConfiguration: this.config.environmentConfiguration,
      postProcessingEnabled: this.config.postProcessingEnabled,
    });
    this.canvasHolder.appendChild(this.composer.renderer.domElement);

    if (this.config.enableTweakPane !== false) {
      this.setupTweakPane();
    }

    const resizeObserver = new ResizeObserver(() => {
      this.composer.fitContainer();
    });
    resizeObserver.observe(this.element);

    this.spawnConfiguration = normalizeSpawnConfiguration(this.config.spawnConfiguration);

    const spawnData = getSpawnData(this.spawnConfiguration, true);
    const spawnRotation = new Quaternion().setFromEuler(spawnData.spawnRotation);

    const initialNetworkLoadRef = {};
    this.loadingProgressManager.addLoadingAsset(initialNetworkLoadRef, "network", "network");
    this.networkClient = new UserNetworkingClient(
      {
        url: this.config.userNetworkAddress,
        sessionToken: this.config.sessionToken,
        websocketFactory: (url: string) => new WebSocket(url, "delta-net-v0.1"),
        statusUpdateCallback: (status: WebsocketStatus) => {
          console.log(`Websocket status: ${status}`);
          if (status === WebsocketStatus.Disconnected || status === WebsocketStatus.Reconnecting) {
            // The connection was lost after being established - the connection may be re-established with a different client ID
            this.characterManager.clear();
            this.remoteUserStates.clear();
            this.clientId = null;
          }
        },
        assignedIdentity: (clientId: number) => {
          console.log(`Assigned ID: ${clientId}`);
          this.clientId = clientId;
          if (this.initialLoadCompleted) {
            // Already loaded - respawn the character
            const spawnData = getSpawnData(this.spawnConfiguration, true);
            this.spawnCharacter(spawnData);
          } else {
            this.loadingProgressManager.completedLoadingAsset(initialNetworkLoadRef);
          }
        },
        onUpdate: (update: NetworkUpdate): void => {
          this.onNetworkUpdate(update);
        },
        onServerError: (error: { message: string; errorType: string }) => {
          switch (error.errorType) {
            case DeltaNetV01ServerErrors.USER_AUTHENTICATION_FAILED_ERROR_TYPE:
              this.disposeWithError(error.message);
              break;
            case DeltaNetV01ServerErrors.USER_NETWORKING_CONNECTION_LIMIT_REACHED_ERROR_TYPE:
              this.disposeWithError(error.message);
              break;
            case DeltaNetV01ServerErrors.USER_NETWORKING_SERVER_SHUTDOWN_ERROR_TYPE:
              this.disposeWithError(error.message || "Server shutdown");
              break;
            default:
              console.error(`Unhandled server error: ${error.message}`);
              this.disposeWithError(error.message);
          }
        },
        onCustomMessage: (customType: number, contents: string) => {
          if (customType === SERVER_BROADCAST_MESSAGE_TYPE) {
            const serverBroadcastMessage = parseServerBroadcastMessage(contents);
            if (serverBroadcastMessage instanceof Error) {
              console.error(`Invalid server broadcast message: ${contents}`);
            } else {
              this.config.onServerBroadcast?.(serverBroadcastMessage);
            }
          } else if (customType === FROM_SERVER_CHAT_MESSAGE_TYPE) {
            const serverChatMessage = parseServerChatMessage(contents);
            if (serverChatMessage instanceof Error) {
              console.error(`Invalid server chat message: ${contents}`);
            } else {
              this.handleChatMessage(serverChatMessage.fromUserId, serverChatMessage.message);
            }
          } else {
            console.warn(`Did not recognize custom message type ${customType}`);
          }
        },
      },
      {
        username: null,
        characterDescription: null,
        colors: null,
      },
      {
        position: spawnData.spawnPosition,
        rotation: {
          quaternionY: spawnRotation.y,
          quaternionW: spawnRotation.w,
        },
        state: 0,
      },
    );

    if (this.config.allowOrbitalCamera) {
      this.keyInputManager.createKeyBinding(toggleCameraKey, () => {
        if (document.activeElement === document.body) {
          // No input is selected - accept the key press
          this.cameraManager.toggleFlyCamera();
          this.composer.fitContainer();
        }
      });
    }

    const animationsPromise = Character.loadAnimations(
      this.characterModelLoader,
      this.config.animationConfig,
    );

    this.characterManager = new CharacterManager({
      composer: this.composer,
      characterModelLoader: this.characterModelLoader,
      collisionsManager: this.collisionsManager,
      cameraManager: this.cameraManager,
      timeManager: this.timeManager,
      keyInputManager: this.keyInputManager,
      virtualJoystick: this.virtualJoystick,
      remoteUserStates: this.remoteUserStates,
      sendUpdate: (characterState: CharacterState) => {
        this.latestCharacterObject.characterState = characterState;
        this.networkClient.sendUpdate(characterState);
      },
      sendLocalCharacterColors: (colors: Array<[number, number, number]>) => {
        this.networkClient.updateColors(colors);
      },
      animationsPromise: animationsPromise,
      spawnConfiguration: this.spawnConfiguration,
      characterResolve: (characterId: number) => {
        return this.resolveCharacterData(characterId);
      },
      updateURLLocation: this.config.updateURLLocation !== false,
    });
    this.scene.add(this.characterManager.group);

    if (this.spawnConfiguration.enableRespawnButton) {
      this.respawnButton = this.createRespawnButton();
      this.element.appendChild(this.respawnButton);
    }

    this.setGroundPlaneEnabled(this.config.environmentConfiguration?.groundPlane ?? true);

    this.setupMMLScene();

    this.loadingScreen = new LoadingScreen(this.loadingProgressManager, this.config.loadingScreen);
    this.element.append(this.loadingScreen.element);

    this.loadingProgressManager.addProgressCallback(() => {
      const [, completed] = this.loadingProgressManager.toRatio();
      if (completed && !this.initialLoadCompleted) {
        this.initialLoadCompleted = true;
        /*
         When all content (in particular MML) has loaded, spawn the character (this is to avoid the character falling
         through as-yet-unloaded geometry)
        */

        this.connectToTextChat();
        this.mountAvatarSelectionUI();
        this.spawnCharacter(spawnData);
      }
    });
    this.loadingProgressManager.setInitialLoad(true);
  }

  private setGroundPlaneEnabled(enabled: boolean) {
    if (enabled && this.groundPlane === null) {
      this.groundPlane = new GroundPlane(this.config.environmentConfiguration?.groundPlaneType);
      this.collisionsManager.addMeshesGroup(this.groundPlane);
      if (this.groundPlane.grass) {
        this.scene.add(this.groundPlane.grass);
      }
      this.scene.add(this.groundPlane);
    } else if (!enabled && this.groundPlane !== null) {
      this.collisionsManager.removeMeshesGroup(this.groundPlane);
      if (this.groundPlane.grass) {
        this.scene.remove(this.groundPlane.grass);
      }
      this.scene.remove(this.groundPlane);
      this.groundPlane = null;
    }
  }

  public updateConfig(config: Partial<UpdatableConfig>) {
    this.config = {
      ...this.config,
      ...config,
    };
    if (config.environmentConfiguration) {
      this.composer.updateEnvironmentConfiguration(config.environmentConfiguration);
      this.setGroundPlaneEnabled(config.environmentConfiguration.groundPlane ?? true);
    }

    if (this.avatarSelectionUI) {
      if (config.avatarConfiguration) {
        this.avatarSelectionUI.updateAvatarConfig(config.avatarConfiguration);
      }
      this.avatarSelectionUI.updateAllowCustomDisplayName(config.allowCustomDisplayName || false);
    }

    if (config.enableTweakPane !== undefined) {
      if (config.enableTweakPane === false && this.tweakPane !== null) {
        this.tweakPane.dispose();
        this.tweakPane = null;
      } else if (config.enableTweakPane === true && this.tweakPane === null) {
        this.setupTweakPane();
      }
    }

    if (this.config.postProcessingEnabled !== undefined) {
      this.composer.togglePostProcessing(this.config.postProcessingEnabled);
      if (this.tweakPane) {
        this.tweakPane.dispose();
        this.tweakPane = null;
        this.setupTweakPane();
      }
    }

    if (config.allowOrbitalCamera !== undefined) {
      if (config.allowOrbitalCamera === false) {
        this.keyInputManager.removeKeyBinding(toggleCameraKey);
        if (this.cameraManager.isFlyCameraOn() === true) {
          // Disable the fly camera if it was enabled
          this.cameraManager.toggleFlyCamera();
        }
      } else if (config.allowOrbitalCamera === true) {
        this.keyInputManager.createKeyBinding(toggleCameraKey, () => {
          if (document.activeElement === document.body) {
            // No input is selected - accept the key press
            this.cameraManager.toggleFlyCamera();
            this.composer.fitContainer();
          }
        });
      }
    }

    if (config.enableChat) {
      if (!config.enableChat && this.textChatUI !== null) {
        this.textChatUI.dispose();
        this.textChatUI = null;
      } else {
        this.connectToTextChat();
      }
    }

    this.spawnConfiguration = normalizeSpawnConfiguration(config.spawnConfiguration);
    if (this.characterManager.localController) {
      this.characterManager.localController.updateSpawnConfig(this.spawnConfiguration);
    }
    if (this.spawnConfiguration.enableRespawnButton && !this.respawnButton) {
      this.respawnButton = this.createRespawnButton();
      this.element.appendChild(this.respawnButton);
    } else if (!this.spawnConfiguration.enableRespawnButton && this.respawnButton) {
      this.respawnButton.remove();
      this.respawnButton = null;
    }

    if (config.mmlDocuments) {
      this.setMMLDocuments(config.mmlDocuments);
    }
  }

  static createFullscreenHolder(): HTMLDivElement {
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";

    const holder = document.createElement("div");
    holder.style.position = "absolute";
    holder.style.width = "100%";
    holder.style.height = "100%";
    holder.style.overflow = "hidden";
    document.body.appendChild(holder);
    return holder;
  }

  private createRespawnButton(): HTMLDivElement {
    const respawnButton = document.createElement("div");
    respawnButton.className = styles.respawnButton;
    respawnButton.textContent = "RESPAWN";
    respawnButton.addEventListener("click", () => {
      this.characterManager.localController?.resetPosition();
    });
    return respawnButton;
  }

  private resolveCharacterData(clientId: number): UserData {
    const user = this.userProfiles.get(clientId)!;

    if (!user) {
      throw new Error(`Failed to resolve user for clientId ${clientId}`);
    }

    return {
      username: user.username,
      characterDescription: user.characterDescription,
      colors: user.colors,
    };
  }

  private onNetworkUpdate(update: NetworkUpdate): void {
    const { removedUserIds, addedUserIds, updatedUsers } = update;
    for (const clientId of removedUserIds) {
      this.userProfiles.delete(clientId);
      this.remoteUserStates.delete(clientId);
    }
    for (const [clientId, userData] of addedUserIds) {
      this.userProfiles.set(clientId, userData.userState);
      this.remoteUserStates.set(clientId, userData.components);
    }
    for (const [clientId, userDataUpdate] of updatedUsers) {
      const userState = userDataUpdate.userState;
      if (userState) {
        if (userState.username !== undefined) {
          this.userProfiles.get(clientId)!.username = userState.username;
        }
        if (userState.characterDescription !== undefined) {
          this.userProfiles.get(clientId)!.characterDescription = userState.characterDescription;
        }
        if (userState.colors !== undefined) {
          this.userProfiles.get(clientId)!.colors = userState.colors;
        }
        this.characterManager.networkCharacterInfoUpdated(clientId);
      }
      this.remoteUserStates.set(clientId, userDataUpdate.components);
    }
  }

  private sendIdentityUpdateToServer(
    displayName: string,
    characterDescription: CharacterDescription,
  ) {
    if (!this.clientId) {
      throw new Error("Client ID not set");
    }

    this.networkClient.updateUsername(displayName);
    this.networkClient.updateCharacterDescription(characterDescription);
  }

  private setupTweakPane() {
    if (this.tweakPane) {
      return;
    }

    this.tweakPane = new TweakPane(
      this.element,
      this.composer.renderer,
      this.scene,
      this.composer,
      this.config.postProcessingEnabled,
      this.collisionsManager.toggleDebug,
    );
    this.cameraManager.setupTweakPane(this.tweakPane);
    this.composer.setupTweakPane(this.tweakPane);
  }

  private handleChatMessage(fromUserId: number, message: string) {
    if (this.textChatUI === null) {
      return;
    }

    if (fromUserId === 0) {
      // Server message - handle as system message
      this.textChatUI.addTextMessage("System", message);
    } else {
      // User message
      const user = this.userProfiles.get(fromUserId);
      if (!user) {
        console.error(`User not found for clientId ${fromUserId}`);
        return;
      }
      const username = user.username ?? `Unknown User ${fromUserId}`;
      this.textChatUI.addTextMessage(username, message);
      this.characterManager.addChatBubble(fromUserId, message);
    }
  }

  private connectToTextChat() {
    if (this.clientId === null) {
      return;
    }

    if (this.config.enableChat && this.textChatUI === null) {
      const user = this.userProfiles.get(this.clientId);
      if (!user) {
        throw new Error("User not found");
      }

      const textChatUISettings: TextChatUIProps = {
        holderElement: this.canvasHolder,
        sendMessageToServerMethod: (message: string) => {
          this.characterManager.addSelfChatBubble(message);
          this.mmlCompositionScene.onChatMessage(message);

          // Send chat message through deltanet custom message
          this.networkClient.sendCustomMessage(
            FROM_CLIENT_CHAT_MESSAGE_TYPE,
            JSON.stringify({ message } satisfies ClientChatMessage),
          );
        },
        visibleByDefault: this.config.chatVisibleByDefault,
        stringToHslOptions: this.config.userNameToColorOptions,
      };
      this.textChatUI = new TextChatUI(textChatUISettings);
      this.textChatUI.init();
    }
  }

  private mountAvatarSelectionUI() {
    if (this.clientId === null) {
      throw new Error("Client ID not set");
    }
    const ownIdentity = this.userProfiles.get(this.clientId);
    if (!ownIdentity) {
      throw new Error("Own identity not found");
    }
    this.avatarSelectionUI = new AvatarSelectionUI({
      holderElement: this.element,
      visibleByDefault: false,
      displayName: ownIdentity.username ?? `Unknown User ${this.clientId}`,
      characterDescription: ownIdentity.characterDescription ?? {
        meshFileUrl: "",
      },
      sendIdentityUpdateToServer: this.sendIdentityUpdateToServer.bind(this),
      availableAvatars: this.config.avatarConfiguration?.availableAvatars ?? [],
      allowCustomAvatars: this.config.avatarConfiguration?.allowCustomAvatars,
      allowCustomDisplayName: this.config.allowCustomDisplayName || false,
    });
    this.avatarSelectionUI.init();
  }

  public update(): void {
    this.timeManager.update();
    this.characterManager.update();
    this.cameraManager.update();

    if (this.config.environmentConfiguration?.groundPlane !== false) {
      if (this.config.environmentConfiguration?.groundPlaneType === "grass") {
        this.groundPlane!.update(this.timeManager.deltaTime);
      }
    }

    // Update audio listener position to character's head while maintaining camera rotation
    this.updateAudioListenerPosition();

    const characterPosition = this.characterManager.localCharacter?.getPosition();
    this.composer.sun?.updateCharacterPosition(
      new Vector3(characterPosition?.x || 0, characterPosition?.y || 0, characterPosition?.z || 0),
    );
    this.composer.render(this.timeManager);
    if (this.tweakPane?.guiVisible) {
      this.tweakPane.updateStats(this.timeManager);
      this.tweakPane.updateCameraData(this.cameraManager);
      if (this.characterManager.localCharacter && this.characterManager.localController) {
        if (!this.characterControllerPaneSet) {
          this.characterControllerPaneSet = true;
          this.characterManager.setupTweakPane(this.tweakPane);
        } else {
          this.tweakPane.updateCharacterData(this.characterManager.localController);
        }
      }
    }
    this.currentRequestAnimationFrame = requestAnimationFrame(() => {
      this.update();
    });
  }

  private updateAudioListenerPosition(): void {
    // Try to position audio listener at character's head
    const localCharacter = this.characterManager.localCharacter;
    const headWorldPosition = localCharacter?.getHeadWorldPosition();

    if (headWorldPosition) {
      // Position the audio listener at the character's head
      this.audioListener.position.copy(headWorldPosition);

      // Copy camera rotation for proper directional audio
      this.audioListener.rotation.copy(this.cameraManager.camera.rotation);
      this.audioListener.updateMatrixWorld();
    } else {
      // Fallback to camera position if head bone not available yet
      this.audioListener.position.copy(this.cameraManager.camera.position);
      this.audioListener.rotation.copy(this.cameraManager.camera.rotation);
      this.audioListener.updateMatrixWorld();
    }
  }

  private spawnCharacter({
    spawnPosition,
    spawnRotation,
    cameraPosition,
  }: {
    spawnPosition: Vector3;
    spawnRotation: Euler;
    cameraPosition: Vector3;
  }) {
    if (this.clientId === null) {
      throw new Error("Client ID not set");
    }

    const ownIdentity = this.userProfiles.get(this.clientId);
    if (!ownIdentity) {
      throw new Error("Own identity not found");
    }

    this.characterManager.spawnLocalCharacter(
      this.clientId!,
      ownIdentity.username ?? `Unknown User ${this.clientId}`,
      ownIdentity.characterDescription,
      spawnPosition,
      spawnRotation,
    );

    if (cameraPosition !== null) {
      this.cameraManager.camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
      this.cameraManager.setTarget(
        new Vector3().add(spawnPosition).add(CharacterManager.headTargetOffset),
      );
      this.cameraManager.reverseUpdateFromPositions();
    }
  }

  private disposeWithError(message: string) {
    this.dispose();
    this.errorScreen = new ErrorScreen("An error occurred", message);
    this.element.append(this.errorScreen.element);
  }

  public dispose() {
    this.characterManager.dispose();
    this.networkClient.stop();
    for (const mmlDocumentState of Object.values(this.mmlDocumentStates)) {
      mmlDocumentState.dispose();
    }
    this.mmlDocumentStates = {};
    this.textChatUI?.dispose();
    this.mmlCompositionScene.dispose();
    this.composer.dispose();
    this.tweakPane?.dispose();
    if (this.currentRequestAnimationFrame !== null) {
      cancelAnimationFrame(this.currentRequestAnimationFrame);
      this.currentRequestAnimationFrame = null;
    }
    this.cameraManager.dispose();
    this.loadingScreen.dispose();
    this.errorScreen?.dispose();
  }

  private setupMMLScene() {
    registerCustomElementsToWindow(window);
    this.mmlCompositionScene = new MMLCompositionScene({
      targetElement: this.element,
      renderer: this.composer.renderer,
      scene: this.scene,
      camera: this.cameraManager.camera,
      audioListener: this.audioListener,
      collisionsManager: this.collisionsManager,
      getUserPositionAndRotation: () => {
        return this.characterManager.getLocalCharacterPositionAndRotation();
      },
    });
    this.scene.add(this.mmlCompositionScene.group);
    setGlobalMMLScene(this.mmlCompositionScene.mmlScene as IMMLScene);
    setGlobalDocumentTimeManager(this.mmlCompositionScene.documentTimeManager);

    this.setMMLDocuments(this.config.mmlDocuments ?? {});

    const mmlProgressManager = this.mmlCompositionScene.mmlScene.getLoadingProgressManager!()!;
    this.loadingProgressManager.addLoadingDocument(mmlProgressManager, "mml", mmlProgressManager);
    mmlProgressManager.addProgressCallback(() => {
      this.loadingProgressManager.updateDocumentProgress(mmlProgressManager);
    });
    mmlProgressManager.setInitialLoad(true);
  }

  private createMMLDocument(mmlDocConfig: MMLDocumentConfiguration): MMLDocumentState {
    const mmlScene = this.mmlCompositionScene.mmlScene;
    const loadingProgressManager = new LoadingProgressManager();
    const docRef = {};
    const mmlNetworkSource = MMLNetworkSource.create({
      url: MMLNetworkSource.resolveRelativeUrl(window.location.host, mmlDocConfig.url),
      connectionToken: mmlDocConfig.passAuthToken ? (this.config.authToken ?? null) : null,
      mmlScene,
      statusUpdated: (status: NetworkedDOMWebsocketStatus) => {
        // no-op
      },
      windowTarget: window,
      targetForWrappers: document.body,
    });

    this.updateMMLDocumentAttributes(mmlNetworkSource, mmlDocConfig);
    return {
      docRef,
      loadingProgressManager,
      config: mmlDocConfig,
      source: mmlNetworkSource,
      dispose: () => {
        mmlNetworkSource.dispose();
      },
    };
  }

  private updateMMLDocumentAttributes(
    mmlNetworkSource: MMLNetworkSource,
    mmlDocument: MMLDocumentConfiguration,
  ) {
    const remoteDocument = mmlNetworkSource.remoteDocumentWrapper.remoteDocument;
    if (mmlDocument.position) {
      remoteDocument.setAttribute("x", mmlDocument.position.x.toString());
      remoteDocument.setAttribute("y", mmlDocument.position.y.toString());
      remoteDocument.setAttribute("z", mmlDocument.position.z.toString());
    } else {
      remoteDocument.setAttribute("x", "0");
      remoteDocument.setAttribute("y", "0");
      remoteDocument.setAttribute("z", "0");
    }
    if (mmlDocument.rotation) {
      remoteDocument.setAttribute("rx", mmlDocument.rotation.x.toString());
      remoteDocument.setAttribute("ry", mmlDocument.rotation.y.toString());
      remoteDocument.setAttribute("rz", mmlDocument.rotation.z.toString());
    } else {
      remoteDocument.setAttribute("rx", "0");
      remoteDocument.setAttribute("ry", "0");
      remoteDocument.setAttribute("rz", "0");
    }
    if (mmlDocument.scale?.x !== undefined) {
      remoteDocument.setAttribute("sx", mmlDocument.scale.x.toString());
    } else {
      remoteDocument.setAttribute("sx", "1");
    }
    if (mmlDocument.scale?.y !== undefined) {
      remoteDocument.setAttribute("sy", mmlDocument.scale.y.toString());
    } else {
      remoteDocument.setAttribute("sy", "1");
    }
    if (mmlDocument.scale?.z !== undefined) {
      remoteDocument.setAttribute("sz", mmlDocument.scale.z.toString());
    } else {
      remoteDocument.setAttribute("sz", "1");
    }
    return mmlNetworkSource;
  }

  private setMMLDocuments(mmlDocuments: { [key: string]: MMLDocumentConfiguration }) {
    const newMMLDocuments: { [key: string]: MMLDocumentState } = {};
    for (const [key, mmlDocConfig] of Object.entries(mmlDocuments)) {
      let existing: MMLDocumentState | undefined = this.mmlDocumentStates[key];
      if (
        existing &&
        (existing.config.url !== mmlDocConfig.url ||
          existing.config.passAuthToken !== mmlDocConfig.passAuthToken)
      ) {
        // URL or auth token changed - dispose of existing and create new
        existing.dispose();
        existing = undefined;
      }
      if (!existing) {
        newMMLDocuments[key] = this.createMMLDocument(mmlDocConfig);
      } else {
        delete this.mmlDocumentStates[key];
        this.updateMMLDocumentAttributes(existing.source, mmlDocConfig);
        newMMLDocuments[key] = existing;
      }
    }
    for (const element of Object.values(this.mmlDocumentStates)) {
      element.dispose();
    }
    this.mmlDocumentStates = newMMLDocuments;
  }
}
