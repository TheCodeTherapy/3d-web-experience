import {
  IMMLScene,
  Interaction,
  InteractionListener,
  InteractionManager,
  MMLClickTrigger,
  PromptManager,
  PromptProps,
  registerCustomElementsToWindow,
  setGlobalMScene,
  PositionAndRotation,
  MElement,
} from "mml-web";
import { AudioListener, Group, Object3D, PerspectiveCamera, Scene, WebGLRenderer } from "three";

import { CollisionsManager } from "../collisions/CollisionsManager";

export class MMLCompositionScene {
  public group: Group;
  private debug: boolean = false;

  private readonly mmlScene: Partial<IMMLScene>;
  private readonly promptManager: PromptManager;
  private readonly interactionListener: InteractionListener;
  private readonly clickTrigger: MMLClickTrigger;

  constructor(
    private renderer: WebGLRenderer,
    private scene: Scene,
    private camera: PerspectiveCamera,
    private audioListener: AudioListener,
    private collisionsManager: CollisionsManager,
    private getUserPositionAndRotation: () => PositionAndRotation,
    documentAddresses: Array<string>,
  ) {
    this.group = new Group();
    this.promptManager = PromptManager.init(document.body);

    const { interactionListener } = InteractionManager.init(document.body, this.camera, this.scene);
    this.interactionListener = interactionListener;

    this.mmlScene = {
      getAudioListener: () => this.audioListener,
      getRenderer: () => this.renderer,
      getThreeScene: () => this.scene,
      getRootContainer: () => this.group,
      getCamera: () => this.camera,
      addCollider: (object: Object3D, mElement: MElement) => {
        this.collisionsManager.addMeshesGroup(object as Group, mElement);
      },
      updateCollider: (object: Object3D) => {
        this.collisionsManager.updateMeshesGroup(object as Group);
      },
      removeCollider: (object: Object3D) => {
        this.collisionsManager.removeMeshesGroup(object as Group);
      },
      getUserPositionAndRotation: this.getUserPositionAndRotation,
      addInteraction: (interaction: Interaction) => {
        this.interactionListener.addInteraction(interaction);
      },
      updateInteraction: (interaction: Interaction) => {
        this.interactionListener.updateInteraction(interaction);
      },
      removeInteraction: (interaction: Interaction) => {
        this.interactionListener.removeInteraction(interaction);
      },
      prompt: (promptProps: PromptProps, callback: (message: string | null) => void) => {
        this.promptManager.prompt(promptProps, callback);
      },
    };
    setGlobalMScene(this.mmlScene as IMMLScene);
    registerCustomElementsToWindow(window);
    this.clickTrigger = MMLClickTrigger.init(document, this.mmlScene as IMMLScene);
    if (this.debug) {
      console.log(this.clickTrigger);
    }
    for (const address of documentAddresses) {
      const frameElement = document.createElement("m-frame");
      frameElement.setAttribute("src", address);
      document.body.appendChild(frameElement);
    }
  }
}
