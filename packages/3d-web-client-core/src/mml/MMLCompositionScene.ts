import {
  ChatProbe,
  IMMLScene,
  Interaction,
  InteractionListener,
  InteractionManager,
  LinkProps,
  LoadingProgressManager,
  MElement,
  MMLDocumentTimeManager,
  PositionAndRotation,
  PromptManager,
  PromptProps,
} from "@mml-io/mml-web";
import {
  ThreeJSClickTrigger,
  ThreeJSGraphicsAdapter,
  ThreeJSGraphicsInterface,
  ThreeJSInteractionAdapter,
} from "@mml-io/mml-web-threejs";
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

  public readonly mmlScene: IMMLScene<ThreeJSGraphicsAdapter>;
  public readonly documentTimeManager: MMLDocumentTimeManager;
  private readonly promptManager: PromptManager;
  private readonly interactionManager: InteractionManager;
  private readonly interactionListener: InteractionListener<ThreeJSGraphicsAdapter>;
  private readonly chatProbes = new Set<ChatProbe<ThreeJSGraphicsAdapter>>();
  private readonly clickTrigger: ThreeJSClickTrigger;
  private readonly loadingProgressManager: LoadingProgressManager;

  constructor(private config: MMLCompositionSceneConfig) {
    this.group = new Group();
    this.promptManager = PromptManager.init(this.config.targetElement);

    const graphicsAdapter: ThreeJSGraphicsAdapter = {
      collisionType: null as unknown as Object3D,
      containerType: null as unknown as Object3D,
      getGraphicsAdapterFactory: () => {
        return ThreeJSGraphicsInterface;
      },
      getRootContainer: () => {
        return this.group;
      },
      interactionShouldShowDistance(
        interaction: Interaction<ThreeJSGraphicsAdapter>,
      ): number | null {
        return ThreeJSInteractionAdapter.interactionShouldShowDistance(
          interaction,
          this.config.camera,
          this.config.scene,
        );
      },
      dispose(): void {},
      getAudioListener: () => {
        return config.audioListener;
      },
      getCamera: () => {
        return config.camera;
      },
      getThreeScene: () => {
        return config.scene;
      },
      getUserPositionAndRotation: () => {
        return this.config.getUserPositionAndRotation();
      },
    };

    const { interactionListener, interactionManager } = InteractionManager.init(
      this.config.targetElement,
      (interaction: Interaction<ThreeJSGraphicsAdapter>) => {
        return graphicsAdapter.interactionShouldShowDistance(interaction);
      },
    );
    this.interactionManager = interactionManager;
    this.interactionListener = interactionListener;
    this.loadingProgressManager = new LoadingProgressManager();
    this.documentTimeManager = new MMLDocumentTimeManager();

    this.mmlScene = {
      getGraphicsAdapter(): ThreeJSGraphicsAdapter {
        return graphicsAdapter;
      },
      hasGraphicsAdapter(): boolean {
        return true;
      },
      getRootContainer: () => this.group,
      addCollider: (object: Object3D, mElement: MElement<ThreeJSGraphicsAdapter>) => {
        this.config.collisionsManager.addMeshesGroup(object as Group, mElement);
      },
      updateCollider: (object: Object3D) => {
        this.config.collisionsManager.updateMeshesGroup(object as Group);
      },
      removeCollider: (object: Object3D) => {
        this.config.collisionsManager.removeMeshesGroup(object as Group);
      },
      getUserPositionAndRotation: this.config.getUserPositionAndRotation,
      addInteraction: (interaction: Interaction<ThreeJSGraphicsAdapter>) => {
        this.interactionListener.addInteraction(interaction);
      },
      updateInteraction: (interaction: Interaction<ThreeJSGraphicsAdapter>) => {
        this.interactionListener.updateInteraction(interaction);
      },
      removeInteraction: (interaction: Interaction<ThreeJSGraphicsAdapter>) => {
        this.interactionListener.removeInteraction(interaction);
      },
      addChatProbe: (chatProbe: ChatProbe<ThreeJSGraphicsAdapter>) => {
        this.chatProbes.add(chatProbe);
      },
      updateChatProbe: () => {
        // no-op
      },
      removeChatProbe: (chatProbe: ChatProbe<ThreeJSGraphicsAdapter>) => {
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

    this.clickTrigger = ThreeJSClickTrigger.init(
      this.config.targetElement,
      this.group,
      this.config.camera,
    );
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
