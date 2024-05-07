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
  TimeManager,
} from "@mml-io/3d-web-client-core";
import { EditableNetworkedDOM, NetworkedDOM } from "@mml-io/networked-dom-document";
import { MMLWebRunnerClient } from "mml-web-runner";
import { AudioListener, Euler, Scene, Vector3 } from "three";

import hdrJpgUrl from "../../../assets/hdr/puresky_2k.jpg";
import airAnimationFileUrl from "../../../assets/models/anim_air.glb";
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

  private readonly scene = new Scene();
  private readonly audioListener = new AudioListener();
  private readonly characterModelLoader = new CharacterModelLoader();
  public readonly composer: Composer;
  private readonly timeManager = new TimeManager();
  private readonly keyInputManager = new KeyInputManager(() => {
    return this.cameraManager.dragging;
  });
  private readonly characterManager: CharacterManager;
  private readonly cameraManager: CameraManager;

  private readonly collisionsManager = new CollisionsManager(this.scene);
  private readonly remoteUserStates = new Map<number, CharacterState>();

  private mmlComposition: MMLCompositionScene;
  private resizeObserver: ResizeObserver;
  private documentRunnerClients = new Set<MMLWebRunnerClient>();
  private animationFrameRequest: number | null = null;

  constructor(
    private localAvatarServer: LocalAvatarServer,
    private localClientId: number,
    spawnPosition: Vector3,
    spawnRotation: Euler,
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

    this.cameraManager = new CameraManager(
      this.element,
      this.collisionsManager,
      Math.PI / 2,
      Math.PI / 2,
    );
    this.cameraManager.camera.add(this.audioListener);

    this.composer = new Composer(this.scene, this.cameraManager.camera, true);
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
    });
    this.scene.add(this.characterManager.group);

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

    this.characterManager.spawnLocalCharacter(
      localClientId,
      "User",
      characterDescription,
      spawnPosition,
      spawnRotation,
    );
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
