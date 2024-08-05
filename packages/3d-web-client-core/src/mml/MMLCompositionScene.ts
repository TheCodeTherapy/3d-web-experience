import {
  IMMLScene,
  Interaction,
  InteractionListener,
  InteractionManager,
  MElement,
  MMLClickTrigger,
  PositionAndRotation,
  PromptManager,
  PromptProps,
  ChatProbe,
  LoadingProgressManager,
  LinkProps,
  MMLDocumentTimeManager,
} from "mml-web";
import { AudioListener, Group, Object3D, PerspectiveCamera, Scene, WebGLRenderer } from "three";

import { CollisionsManager } from "../collisions/CollisionsManager";

type MMLCompositionSceneConfig = {
  targetElement: HTMLElement;
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  audioListener: AudioListener;
  collisionsManager: CollisionsManager;
  getUserPositionAndRotation: () => PositionAndRotation;
};

export class MMLCompositionScene {
  public group: Group;

  public readonly mmlScene: IMMLScene;
  public readonly documentTimeManager: MMLDocumentTimeManager;
  private readonly promptManager: PromptManager;
  private readonly interactionManager: InteractionManager;
  private readonly interactionListener: InteractionListener;
  private readonly chatProbes = new Set<ChatProbe>();
  private readonly clickTrigger: MMLClickTrigger;
  private readonly loadingProgressManager: LoadingProgressManager;

  constructor(private config: MMLCompositionSceneConfig) {
    this.group = new Group();
    this.promptManager = PromptManager.init(this.config.targetElement);

    const { interactionListener, interactionManager } = InteractionManager.init(
      this.config.targetElement,
      this.config.camera,
      this.config.scene,
    );
    this.interactionManager = interactionManager;
    this.interactionListener = interactionListener;
    this.loadingProgressManager = new LoadingProgressManager();
    this.documentTimeManager = new MMLDocumentTimeManager();

    this.mmlScene = {
      getAudioListener: () => this.config.audioListener,
      getRenderer: () => this.config.renderer,
      getThreeScene: () => this.config.scene,
      getRootContainer: () => this.group,
      getCamera: () => this.config.camera,
      addCollider: (object: Object3D, mElement: MElement) => {
        this.config.collisionsManager.addMeshesGroup(object as Group, mElement);
      },
      updateCollider: (object: Object3D) => {
        this.config.collisionsManager.updateMeshesGroup(object as Group);
      },
      removeCollider: (object: Object3D) => {
        this.config.collisionsManager.removeMeshesGroup(object as Group);
      },
      getUserPositionAndRotation: this.config.getUserPositionAndRotation,
      addInteraction: (interaction: Interaction) => {
        this.interactionListener.addInteraction(interaction);
      },
      updateInteraction: (interaction: Interaction) => {
        this.interactionListener.updateInteraction(interaction);
      },
      removeInteraction: (interaction: Interaction) => {
        this.interactionListener.removeInteraction(interaction);
      },
      addChatProbe: (chatProbe: ChatProbe) => {
        this.chatProbes.add(chatProbe);
      },
      updateChatProbe: () => {
        // no-op
      },
      removeChatProbe: (chatProbe: ChatProbe) => {
        this.chatProbes.delete(chatProbe);
      },
      prompt: (
        promptProps: PromptProps,
        abortSignal: AbortSignal,
        callback: (message: string | null) => void,
      ) => {
        this.promptManager.prompt(promptProps, abortSignal, callback);
      },
      link: (
        linkProps: LinkProps,
        abortSignal: AbortSignal,
        windowCallback: (openedWindow: Window | null) => void,
      ) => {
        this.promptManager.link(linkProps, abortSignal, windowCallback);
      },
      getLoadingProgressManager: () => {
        return this.loadingProgressManager;
      },
    };

    this.clickTrigger = MMLClickTrigger.init(this.config.targetElement, this.mmlScene as IMMLScene);
  }

  onChatMessage(message: string) {
    for (const chatProbe of this.chatProbes) {
      chatProbe.trigger(message);
    }
  }

  dispose() {
    this.promptManager.dispose();
    this.clickTrigger.dispose();
    this.interactionManager.dispose();
  }
}
