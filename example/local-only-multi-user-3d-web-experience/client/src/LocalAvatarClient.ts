import {
  AnimationConfig,
  CameraManager,
  CharacterDescription,
  CharacterManager,
  CharacterModelLoader,
  CharacterState,
  CollisionsManager,
  Composer,
  GroundPlane,
  KeyInputManager,
  MMLCompositionScene,
  SpawnConfigurationState,
  TimeManager,
} from "@mml-io/3d-web-client-core";
import { MMLWebRunnerClient } from "@mml-io/mml-web-runner";
import { EditableNetworkedDOM, NetworkedDOM } from "@mml-io/networked-dom-document";
import { AudioListener, Euler, Scene, Vector3 } from "three";

import hdrJpgUrl from "../../../assets/hdr/puresky_2k.jpg";
import airAnimationFileUrl from "../../../assets/models/anim_air.glb";
import doubleJumpAnimationFileUrl from "../../../assets/models/anim_double_jump.glb";
import idleAnimationFileUrl from "../../../assets/models/anim_idle.glb";
import jogAnimationFileUrl from "../../../assets/models/anim_jog.glb";
import sprintAnimationFileUrl from "../../../assets/models/anim_run.glb";
import defaultAvatarMeshFileUrl from "../../../assets/models/bot.glb";

import { LocalAvatarServer } from "./LocalAvatarServer";

const animationConfig: AnimationConfig = {
  airAnimationFileUrl,
  idleAnimationFileUrl,
  jogAnimationFileUrl,
  sprintAnimationFileUrl,
  doubleJumpAnimationFileUrl,
};

// Specify the avatar to use here:
const characterDescription: CharacterDescription = {
  // Option 1 (Default) - Use a GLB file directly
  meshFileUrl: defaultAvatarMeshFileUrl, // This is just an address of a GLB file
  // Option 2 - Use an MML Character from a URL
  // mmlCharacterUrl: "https://...",
  // Option 3 - Use an MML Character from a string
  // mmlCharacterString: `<m-character src="https://..."></m-character>`,
};

export class LocalAvatarClient {
  public element: HTMLDivElement;
  private canvasHolder: HTMLDivElement;

  private readonly scene = new Scene();
  private readonly audioListener = new AudioListener();
  private readonly characterModelLoader = new CharacterModelLoader();
  public readonly composer: Composer;
  private readonly timeManager = new TimeManager();
  private readonly keyInputManager = new KeyInputManager(() => {
    return this.cameraManager.hasActiveInput();
  });
  private readonly characterManager: CharacterManager;
  private readonly cameraManager: CameraManager;

  private readonly collisionsManager = new CollisionsManager(this.scene);
  private readonly remoteUserStates = new Map<number, CharacterState>();

  private mmlComposition: MMLCompositionScene;
  private resizeObserver: ResizeObserver;
  private documentRunnerClients = new Set<MMLWebRunnerClient>();
  private animationFrameRequest: number | null = null;

  private spawnConfiguration: SpawnConfigurationState;

  constructor(
    private localAvatarServer: LocalAvatarServer,
    private localClientId: number,
    spawnConfiguration: SpawnConfigurationState,
  ) {
    this.element = document.createElement("div");
    this.element.style.position = "absolute";
    this.element.style.width = "100%";
    this.element.style.height = "100%";

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

    this.cameraManager = new CameraManager(
      this.canvasHolder,
      this.collisionsManager,
      Math.PI / 2,
      Math.PI / 2,
    );
    this.cameraManager.camera.add(this.audioListener);

    this.composer = new Composer({
      scene: this.scene,
      cameraManager: this.cameraManager,
      spawnSun: true,
    });
    this.composer.useHDRJPG(hdrJpgUrl);
    this.element.appendChild(this.composer.renderer.domElement);

    this.resizeObserver = new ResizeObserver(() => {
      this.composer.fitContainer();
    });
    this.resizeObserver.observe(this.element);

    this.localAvatarServer.addClient(
      localClientId,
      (clientId: number, userNetworkingClientUpdate: null | CharacterState) => {
        if (userNetworkingClientUpdate === null) {
          this.remoteUserStates.delete(clientId);
        } else {
          this.remoteUserStates.set(clientId, userNetworkingClientUpdate);
        }
      },
    );

    this.spawnConfiguration = {
      spawnPosition: {
        x: spawnConfiguration?.spawnPosition?.x ?? 0,
        y: spawnConfiguration?.spawnPosition?.y ?? 0,
        z: spawnConfiguration?.spawnPosition?.z ?? 0,
      },
      spawnPositionVariance: {
        x: spawnConfiguration?.spawnPositionVariance?.x ?? 0,
        y: spawnConfiguration?.spawnPositionVariance?.y ?? 0,
        z: spawnConfiguration?.spawnPositionVariance?.z ?? 0,
      },
      spawnYRotation: spawnConfiguration?.spawnYRotation ?? 0,
      respawnTrigger: {
        minX: spawnConfiguration?.respawnTrigger?.minX,
        maxX: spawnConfiguration?.respawnTrigger?.maxX,
        minY: spawnConfiguration?.respawnTrigger?.minY ?? -100,
        maxY: spawnConfiguration?.respawnTrigger?.maxY,
        minZ: spawnConfiguration?.respawnTrigger?.minZ,
        maxZ: spawnConfiguration?.respawnTrigger?.maxZ,
      },
      enableRespawnButton: spawnConfiguration?.enableRespawnButton ?? false,
    };

    this.characterManager = new CharacterManager({
      composer: this.composer,
      characterModelLoader: this.characterModelLoader,
      collisionsManager: this.collisionsManager,
      cameraManager: this.cameraManager,
      timeManager: this.timeManager,
      keyInputManager: this.keyInputManager,
      remoteUserStates: this.remoteUserStates,
      sendUpdate: (characterState: CharacterState) => {
        localAvatarServer.send(localClientId, characterState);
      },
      animationConfig,
      characterResolve: () => {
        return { username: "User", characterDescription };
      },
      spawnConfiguration: this.spawnConfiguration,
    });
    this.scene.add(this.characterManager.group);

    if (spawnConfiguration.enableRespawnButton) {
      this.element.appendChild(this.characterManager.createRespawnButton());
    }

    this.mmlComposition = new MMLCompositionScene({
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
    this.scene.add(this.mmlComposition.group);

    const groundPlane = new GroundPlane();
    this.collisionsManager.addMeshesGroup(groundPlane);
    this.scene.add(groundPlane);

    const spawnPosition = new Vector3(
      this.spawnConfiguration.spawnPosition!.x,
      this.spawnConfiguration.spawnPosition!.y,
      this.spawnConfiguration.spawnPosition!.z,
    );
    const spawnRotation = new Euler(
      0,
      this.spawnConfiguration.spawnYRotation! * (Math.PI / 180),
      0,
    );
    this.characterManager.spawnLocalCharacter(
      localClientId,
      "User",
      characterDescription,
      spawnPosition,
      spawnRotation,
    );

    let cameraPosition: Vector3 | null = null;
    const offset = new Vector3(0, 0, 3.3);
    offset.applyEuler(new Euler(0, spawnRotation.y, 0));
    cameraPosition = spawnPosition.clone().sub(offset).add(this.characterManager.headTargetOffset);

    if (cameraPosition !== null) {
      this.cameraManager.camera.position.copy(cameraPosition);
      this.cameraManager.setTarget(
        new Vector3().add(spawnPosition).add(this.characterManager.headTargetOffset),
      );
      this.cameraManager.reverseUpdateFromPositions();
    }
  }

  public dispose() {
    if (this.animationFrameRequest !== null) {
      cancelAnimationFrame(this.animationFrameRequest);
    }
    for (const documentRunnerClient of this.documentRunnerClients) {
      documentRunnerClient.dispose();
    }
    this.localAvatarServer.removeClient(this.localClientId);
    this.documentRunnerClients.clear();
    this.resizeObserver.disconnect();
    this.mmlComposition.dispose();
    this.characterManager.clear();
    this.cameraManager.dispose();
    this.composer.dispose();
    this.element.remove();
  }

  public update(): void {
    this.timeManager.update();
    this.characterManager.update();
    this.cameraManager.update();
    this.composer.sun?.updateCharacterPosition(this.characterManager.localCharacter?.position);
    this.composer.render(this.timeManager);
    this.animationFrameRequest = requestAnimationFrame(() => {
      this.update();
    });
  }

  public addDocument(
    mmlDocument: NetworkedDOM | EditableNetworkedDOM,
    windowTarget: Window,
    remoteHolderElement: HTMLElement,
  ) {
    const mmlWebRunnerClient = new MMLWebRunnerClient(
      windowTarget,
      remoteHolderElement,
      this.mmlComposition.mmlScene,
    );
    mmlWebRunnerClient.connect(mmlDocument);
    this.documentRunnerClients.add(mmlWebRunnerClient);
  }
}
