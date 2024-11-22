import {
  AvatarSelectionUI,
  AvatarType,
  AvatarConfiguration,
} from "@mml-io/3d-web-avatar-selection-ui";
import {
  AnimationConfig,
  CameraManager,
  CharacterDescription,
  CharacterManager,
  CharacterModelLoader,
  CharacterState,
  CollisionsManager,
  Composer,
  decodeCharacterAndCamera,
  EnvironmentConfiguration,
  ErrorScreen,
  getSpawnPositionInsideCircle,
  GroundPlane,
  KeyInputManager,
  LoadingScreen,
  LoadingScreenConfig,
  MMLCompositionScene,
  TimeManager,
  TweakPane,
  VirtualJoystick,
} from "@mml-io/3d-web-client-core";
import { EditorUI } from "@mml-io/3d-web-client-editor";
import {
  ChatNetworkingClient,
  ChatNetworkingClientChatMessage,
  ChatNetworkingServerErrorType,
  StringToHslOptions,
  TextChatUI,
  TextChatUIProps,
} from "@mml-io/3d-web-text-chat";
import {
  USER_NETWORKING_AUTHENTICATION_FAILED_ERROR_TYPE,
  USER_NETWORKING_CONNECTION_LIMIT_REACHED_ERROR_TYPE,
  USER_NETWORKING_SERVER_SHUTDOWN_ERROR_TYPE,
  USER_NETWORKING_USER_UPDATE_MESSAGE_TYPE,
  UserData,
  UserNetworkingClient,
  UserNetworkingClientUpdate,
  UserNetworkingServerErrorType,
  WebsocketStatus,
} from "@mml-io/3d-web-user-networking";
import { VoiceChatManager, VoiceChatLiveKitManager } from "@mml-io/3d-web-voice-chat";
import { Filter } from "bad-words";
import {
  IMMLScene,
  LoadingProgressManager,
  registerCustomElementsToWindow,
  setGlobalDocumentTimeManager,
  setGlobalMMLScene,
} from "mml-web";
import { AudioListener, Euler, Scene, Vector3 } from "three";

export type MMLDocumentConfiguration = {
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
};

export type Networked3dWebExperienceClientConfig = {
  userNetworkAddress: string;
  sessionToken: string;
  chatVisibleByDefault?: boolean;
  userNameToColorOptions?: StringToHslOptions;
  animationConfig: AnimationConfig;
  voiceChatAddress?: string;
  updateURLLocation?: boolean;
  onServerBroadcast?: (broadcast: { broadcastType: string; payload: any }) => void;
  loadingScreen?: LoadingScreenConfig;
} & UpdatableConfig;

export type UpdatableConfig = {
  chatNetworkAddress?: string | null;
  mmlDocuments?: { [key: string]: MMLDocumentConfiguration };
  environmentConfiguration?: EnvironmentConfiguration;
  avatarConfiguration?: AvatarConfiguration;
  enableTweakPane?: boolean;
};

export class Networked3dWebExperienceClient {
  private element: HTMLDivElement;
  private canvasHolder: HTMLDivElement;

  private scene = new Scene();
  private composer: Composer;
  private tweakPane: TweakPane | null = null;
  private audioListener = new AudioListener();

  private cameraManager: CameraManager;

  private collisionsManager = new CollisionsManager(this.scene);

  private characterModelLoader = new CharacterModelLoader();
  private characterManager: CharacterManager;

  private timeManager = new TimeManager();

  private keyInputManager = new KeyInputManager();
  private virtualJoystick: VirtualJoystick;

  private mmlCompositionScene: MMLCompositionScene;
  private mmlFrames: { [key: string]: HTMLElement } = {};

  private clientId: number | null = null;
  private networkClient: UserNetworkingClient;
  private remoteUserStates = new Map<number, CharacterState>();
  private userProfiles = new Map<number, UserData>();

  private networkChat: ChatNetworkingClient | null = null;
  private textChatUI: TextChatUI | null = null;

  private avatarSelectionUI: AvatarSelectionUI | null = null;

  private voiceChatManager: VoiceChatManager | VoiceChatLiveKitManager | null = null;
  private readonly latestCharacterObject = {
    characterState: null as null | CharacterState,
  };
  private characterControllerPaneSet: boolean = false;

  private initialLoadCompleted = false;
  private loadingProgressManager = new LoadingProgressManager();
  private loadingScreen: LoadingScreen;
  private errorScreen?: ErrorScreen;
  private currentRequestAnimationFrame: number | null = null;
  private groundPlane: GroundPlane | null = null;

  private handleEditorUpdate: (content: string) => void;
  private mmlEditorUI: EditorUI;

  private filter = new Filter();

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

    this.cameraManager = new CameraManager(this.canvasHolder, this.collisionsManager);
    this.cameraManager.camera.add(this.audioListener);

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
    });
    this.canvasHolder.appendChild(this.composer.renderer.domElement);

    if (this.config.enableTweakPane !== false) {
      this.setupTweakPane();
    }

    const resizeObserver = new ResizeObserver(() => {
      this.composer.fitContainer();
    });
    resizeObserver.observe(this.element);

    const initialNetworkLoadRef = {};
    this.loadingProgressManager.addLoadingAsset(initialNetworkLoadRef, "network", "network");
    this.networkClient = new UserNetworkingClient({
      url: this.config.userNetworkAddress,
      sessionToken: this.config.sessionToken,
      websocketFactory: (url: string) => new WebSocket(url),
      statusUpdateCallback: (status: WebsocketStatus) => {
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
          this.spawnCharacter();
        } else {
          this.loadingProgressManager.completedLoadingAsset(initialNetworkLoadRef);
        }
      },
      clientUpdate: (
        remoteClientId: number,
        userNetworkingClientUpdate: null | UserNetworkingClientUpdate,
      ) => {
        if (userNetworkingClientUpdate === null) {
          this.remoteUserStates.delete(remoteClientId);
        } else {
          this.remoteUserStates.set(remoteClientId, userNetworkingClientUpdate);
        }
      },
      clientProfileUpdated: (
        clientId: number,
        username: string,
        characterDescription: CharacterDescription,
      ): void => {
        this.updateUserProfile(clientId, {
          username,
          characterDescription,
        });
      },
      onServerError: (error: { message: string; errorType: UserNetworkingServerErrorType }) => {
        switch (error.errorType) {
          case USER_NETWORKING_AUTHENTICATION_FAILED_ERROR_TYPE:
            this.disposeWithError(error.message);
            break;
          case USER_NETWORKING_CONNECTION_LIMIT_REACHED_ERROR_TYPE:
            this.disposeWithError(error.message);
            break;
          case USER_NETWORKING_SERVER_SHUTDOWN_ERROR_TYPE:
            this.disposeWithError(error.message || "Server shutdown");
            break;
          default:
            console.error(`Unhandled server error: ${error.message}`);
            this.disposeWithError(error.message);
        }
      },
      onServerBroadcast: (broadcast: { broadcastType: string; payload: any }) => {
        this.config.onServerBroadcast?.(broadcast);
      },
    });

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
      animationConfig: this.config.animationConfig,
      characterResolve: (characterId: number) => {
        return this.resolveCharacterData(characterId);
      },
      updateURLLocation: this.config.updateURLLocation !== false,
    });
    this.scene.add(this.characterManager.group);

    this.setGroundPlaneEnabled(this.config.environmentConfiguration?.groundPlane ?? true);

    this.setupMMLScene();

    this.handleEditorUpdate = (content: string) => {
      // no-op
    };
    this.mmlEditorUI = new EditorUI({
      holderElement: this.element,
      visible: false,
      onUpdate: this.handleEditorUpdate.bind(this),
    });
    this.mmlEditorUI.init();

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
        this.connectToVoiceChat();
        this.connectToTextChat();
        this.mountAvatarSelectionUI();
        this.spawnCharacter();
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

    if (config.avatarConfiguration && this.avatarSelectionUI) {
      this.avatarSelectionUI?.updateAvatarConfig(config.avatarConfiguration);
    }

    if (config.enableTweakPane !== undefined) {
      if (config.enableTweakPane === false && this.tweakPane !== null) {
        this.tweakPane.dispose();
        this.tweakPane = null;
      } else if (config.enableTweakPane === true && this.tweakPane === null) {
        this.setupTweakPane();
      }
    }

    if (config.chatNetworkAddress !== undefined) {
      if (config.chatNetworkAddress === null && this.networkChat !== null) {
        this.networkChat.stop();
        this.networkChat = null;
        this.textChatUI?.dispose();
        this.textChatUI = null;
      } else {
        this.connectToTextChat();
      }
    }
    if (config.mmlDocuments) {
      this.setMMLDocuments(config.mmlDocuments);
    }
  }

  static createFullscreenHolder(): HTMLDivElement {
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";

    const holder = document.createElement("div");
    holder.setAttribute("id", "appHolder");
    holder.style.position = "absolute";
    holder.style.width = "100%";
    holder.style.height = "100%";
    holder.style.overflow = "hidden";
    document.body.appendChild(holder);
    return holder;
  }

  private resolveCharacterData(clientId: number): {
    username: string;
    characterDescription: CharacterDescription;
  } {
    const user = this.userProfiles.get(clientId)!;

    if (!user) {
      throw new Error(`Failed to resolve user for clientId ${clientId}`);
    }

    return {
      username: user.username,
      characterDescription: user.characterDescription,
    };
  }

  private updateUserProfile(id: number, userData: UserData) {
    console.log(`Update user_profile for id=${id} (username=${userData.username})`);

    this.userProfiles.set(id, userData);

    this.characterManager.respawnIfPresent(id);
  }

  private updateUserAvatar(avatar: AvatarType) {
    if (this.clientId === null) {
      throw new Error("Client ID not set");
    }
    const user = this.userProfiles.get(this.clientId);
    if (!user) {
      throw new Error("User not found");
    }

    const newUser = {
      ...user,
      characterDescription: {
        meshFileUrl: avatar.meshFileUrl ?? undefined,
        mmlCharacterUrl: avatar.mmlCharacterUrl ?? undefined,
        mmlCharacterString: avatar.mmlCharacterString ?? undefined,
      },
    } as UserData;

    this.userProfiles.set(this.clientId, newUser);
    this.updateUserProfile(this.clientId, newUser);
  }

  private sendChatMessageToServer(message: string): void {
    const filteredMessage = this.filter.clean(message);
    this.mmlCompositionScene.onChatMessage(filteredMessage);
    if (this.clientId === null || this.networkChat === null) return;
    this.networkChat.sendChatMessage(message);
  }

  private sendIdentityUpdateToServer(avatar: AvatarType) {
    if (!this.clientId) {
      throw new Error("Client ID not set");
    }

    const userProfile = this.userProfiles.get(this.clientId);

    if (!userProfile) {
      throw new Error("User profile not found");
    }

    this.networkClient.sendMessage({
      type: USER_NETWORKING_USER_UPDATE_MESSAGE_TYPE,
      userIdentity: {
        username: userProfile.username,
        characterDescription: {
          mmlCharacterString: avatar.mmlCharacterString,
          mmlCharacterUrl: avatar.mmlCharacterUrl,
          meshFileUrl: avatar.meshFileUrl,
        } as CharacterDescription,
      },
    });
  }

  private connectToVoiceChat() {
    if (this.clientId === null) return;

    if (this.voiceChatManager === null && this.config.voiceChatAddress) {
      this.voiceChatManager = new VoiceChatLiveKitManager({
        url: this.config.voiceChatAddress,
        holderElement: this.element,
        userId: this.clientId,
        remoteUserStates: this.remoteUserStates,
        latestCharacterObj: this.latestCharacterObject,
        autoJoin: false,
      });
    }
  }

  private setupTweakPane() {
    if (this.tweakPane) {
      return;
    }
    this.tweakPane = new TweakPane(
      this.element,
      this.composer.renderer,
      this.scene,
      this.composer.effectComposer,
    );
    this.cameraManager.setupTweakPane(this.tweakPane);
    this.composer.setupTweakPane(this.tweakPane);
  }

  private connectToTextChat() {
    if (this.clientId === null) {
      return;
    }
    if (this.networkChat === null && this.config.chatNetworkAddress) {
      const user = this.userProfiles.get(this.clientId);
      if (!user) {
        throw new Error("User not found");
      }

      if (this.textChatUI === null) {
        const textChatUISettings: TextChatUIProps = {
          holderElement: this.element,
          clientname: user.username,
          sendMessageToServerMethod: this.sendChatMessageToServer.bind(this),
          visibleByDefault: this.config.chatVisibleByDefault,
          stringToHslOptions: this.config.userNameToColorOptions,
        };
        this.textChatUI = new TextChatUI(textChatUISettings);
        this.textChatUI.init();
      }

      this.networkChat = new ChatNetworkingClient({
        url: this.config.chatNetworkAddress,
        sessionToken: this.config.sessionToken,
        websocketFactory: (url: string) => new WebSocket(url),
        statusUpdateCallback: (status: WebsocketStatus) => {
          if (status === WebsocketStatus.Disconnected || status === WebsocketStatus.Reconnecting) {
            // The connection was lost after being established - the connection may be re-established with a different client ID
          }
        },
        clientChatUpdate: (
          clientId: number,
          chatNetworkingUpdate: null | ChatNetworkingClientChatMessage,
        ) => {
          if (chatNetworkingUpdate !== null && this.textChatUI !== null) {
            const username = this.userProfiles.get(clientId)?.username || "Unknown";
            this.textChatUI.addTextMessage(username, chatNetworkingUpdate.text);
          }
        },
        onServerError: (error: { message: string; errorType: ChatNetworkingServerErrorType }) => {
          console.error(`Chat server error: ${error.message}. errorType: ${error.errorType}`);
          this.disposeWithError(error.message);
        },
      });
    }
  }

  private mountAvatarSelectionUI() {
    this.avatarSelectionUI = new AvatarSelectionUI({
      holderElement: this.element,
      visibleByDefault: false,
      sendMessageToServerMethod: this.sendIdentityUpdateToServer.bind(this),
      availableAvatars: this.config.avatarConfiguration?.availableAvatars ?? [],
      allowCustomAvatars: this.config.avatarConfiguration?.allowCustomAvatars,
    });
    this.avatarSelectionUI.init();
  }

  public update(): void {
    this.timeManager.update();
    this.characterManager.update();
    this.voiceChatManager?.speakingParticipants.forEach((value: boolean, id: number) => {
      this.characterManager.setSpeakingCharacter(id, value);
    });
    if (this.config.environmentConfiguration?.groundPlane !== false) {
      this.groundPlane!.update(this.timeManager.deltaTime);
    }
    this.cameraManager.update();
    this.composer.sun?.updateCharacterPosition(this.characterManager.localCharacter?.position);
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

    if (this.mmlEditorUI.isVisible === false && this.keyInputManager.isKeyPressed("e")) {
      this.mmlEditorUI.setVisible(true);
    }

    this.currentRequestAnimationFrame = requestAnimationFrame(() => {
      this.update();
    });
  }

  private spawnCharacter() {
    if (this.clientId === null) {
      throw new Error("Client ID not set");
    }
    const spawnPosition = getSpawnPositionInsideCircle(3, 30, this.clientId!, 0.4);
    const spawnRotation = new Euler(0, 0, 0);
    let cameraPosition: Vector3 | null = null;
    if (window.location.hash && window.location.hash.length > 1) {
      const urlParams = decodeCharacterAndCamera(window.location.hash.substring(1));
      spawnPosition.copy(urlParams.character.position);
      spawnRotation.setFromQuaternion(urlParams.character.quaternion);
      cameraPosition = urlParams.camera.position;
    }
    const ownIdentity = this.userProfiles.get(this.clientId);
    if (!ownIdentity) {
      throw new Error("Own identity not found");
    }

    this.characterManager.spawnLocalCharacter(
      this.clientId!,
      ownIdentity.username,
      ownIdentity.characterDescription,
      spawnPosition,
      spawnRotation,
    );

    if (cameraPosition !== null) {
      this.cameraManager.camera.position.copy(cameraPosition);
      this.cameraManager.setTarget(
        new Vector3().add(spawnPosition).add(this.characterManager.headTargetOffset),
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
    this.networkClient.stop();
    this.networkChat?.stop();
    for (const [key, element] of Object.entries(this.mmlFrames)) {
      element.remove();
    }
    this.mmlFrames = {};
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

  private createFrame(mmlDocument: MMLDocumentConfiguration) {
    const frameElement = document.createElement("m-frame");
    frameElement.setAttribute("src", mmlDocument.url);
    this.updateFrameAttributes(frameElement, mmlDocument);
    return frameElement;
  }

  private updateFrameAttributes(frameElement: HTMLElement, mmlDocument: MMLDocumentConfiguration) {
    const existingSrc = frameElement.getAttribute("src");
    if (existingSrc !== mmlDocument.url) {
      frameElement.setAttribute("src", mmlDocument.url);
    }
    if (mmlDocument.position) {
      frameElement.setAttribute("x", mmlDocument.position.x.toString());
      frameElement.setAttribute("y", mmlDocument.position.y.toString());
      frameElement.setAttribute("z", mmlDocument.position.z.toString());
    } else {
      frameElement.setAttribute("x", "0");
      frameElement.setAttribute("y", "0");
      frameElement.setAttribute("z", "0");
    }
    if (mmlDocument.rotation) {
      frameElement.setAttribute("rx", mmlDocument.rotation.x.toString());
      frameElement.setAttribute("ry", mmlDocument.rotation.y.toString());
      frameElement.setAttribute("rz", mmlDocument.rotation.z.toString());
    } else {
      frameElement.setAttribute("rx", "0");
      frameElement.setAttribute("ry", "0");
      frameElement.setAttribute("rz", "0");
    }
    if (mmlDocument.scale?.x !== undefined) {
      frameElement.setAttribute("sx", mmlDocument.scale.x.toString());
    } else {
      frameElement.setAttribute("sx", "1");
    }
    if (mmlDocument.scale?.y !== undefined) {
      frameElement.setAttribute("sy", mmlDocument.scale.y.toString());
    } else {
      frameElement.setAttribute("sy", "1");
    }
    if (mmlDocument.scale?.z !== undefined) {
      frameElement.setAttribute("sz", mmlDocument.scale.z.toString());
    } else {
      frameElement.setAttribute("sz", "1");
    }
  }

  private setMMLDocuments(mmlDocuments: { [key: string]: MMLDocumentConfiguration }) {
    const newFramesMap: { [key: string]: HTMLElement } = {};
    for (const [key, mmlDocSpec] of Object.entries(mmlDocuments)) {
      const existing = this.mmlFrames[key];
      if (!existing) {
        const frameElement = this.createFrame(mmlDocSpec);
        document.body.appendChild(frameElement);
        newFramesMap[key] = frameElement;
      } else {
        delete this.mmlFrames[key];
        newFramesMap[key] = existing;
        this.updateFrameAttributes(existing, mmlDocSpec);
      }
    }
    for (const [key, element] of Object.entries(this.mmlFrames)) {
      element.remove();
    }
    this.mmlFrames = newFramesMap;
  }
}
