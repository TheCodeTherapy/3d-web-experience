import { AnimationClip, Color, Euler, Group, Object3D, Quaternion, Vector3 } from "three";

import { CameraManager } from "../camera/CameraManager";
import { Composer } from "../rendering/composer";

import { CharacterModel } from "./CharacterModel";
import { AnimationState } from "./CharacterState";
import { CharacterTooltip } from "./CharacterTooltip";
import { CharacterModelLoader } from "./loading/CharacterModelLoader";
import { lowPolyLoDModelURL } from "./LowPolyModel";

export type AnimationSettings = {
  fileUrl: string;
  loop?: boolean;
  discardNonRotationTransform?: boolean;
  playbackSpeed?: number;
  transformRootBonePosition?: Vector3;
};

export type AnimationConfig = {
  idleAnimationUrlOrConfig: string | AnimationSettings;
  jogAnimationUrlOrConfig: string | AnimationSettings;
  sprintAnimationUrlOrConfig: string | AnimationSettings;
  airAnimationUrlOrConfig: string | AnimationSettings;
  doubleJumpAnimationUrlOrConfig: string | AnimationSettings;
  slideAnimationUrlOrConfig?: string | AnimationSettings;
};

export type AnimationConfigMetadata = {
  loop: boolean;
  discardNonRotationTransform: boolean;
  playbackSpeed: number;
  transformRootBonePosition?: Vector3;
};

export type LoadedAnimations = {
  idleAnimation: { clip: AnimationClip; config: AnimationConfigMetadata };
  jogAnimation: { clip: AnimationClip; config: AnimationConfigMetadata };
  sprintAnimation: { clip: AnimationClip; config: AnimationConfigMetadata };
  airAnimation: { clip: AnimationClip; config: AnimationConfigMetadata };
  doubleJumpAnimation: { clip: AnimationClip; config: AnimationConfigMetadata };
  slideAnimation?: { clip: AnimationClip; config: AnimationConfigMetadata };
};

export type CharacterDescription =
  | {
      meshFileUrl: string;
      mmlCharacterString?: null;
      mmlCharacterUrl?: null;
    }
  | {
      meshFileUrl?: null;
      mmlCharacterString: string;
      mmlCharacterUrl?: null;
    }
  | {
      meshFileUrl?: null;
      mmlCharacterString?: null;
      mmlCharacterUrl: string;
    };

export type CharacterConfig = {
  username: string;
  characterDescription: CharacterDescription | null;
  animationsPromise: Promise<LoadedAnimations>;
  characterModelLoader: CharacterModelLoader;
  characterId: number;
  modelLoadedCallback: () => void;
  modelLoadFailedCallback?: (error: Error) => void;
  cameraManager: CameraManager;
  composer: Composer;
  isLocal: boolean;
  abortController?: AbortController;
};

function characterHeightToTooltipHeightOffset(characterHeight: number): number {
  return characterHeight + 0.15;
}

function characterDescriptionMatches(
  a: CharacterDescription | null,
  b: CharacterDescription | null,
): boolean {
  if (a === null && b === null) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  return (
    a?.meshFileUrl === b?.meshFileUrl &&
    a?.mmlCharacterString === b?.mmlCharacterString &&
    a?.mmlCharacterUrl === b?.mmlCharacterUrl
  );
}

export class Character extends Group {
  private model: CharacterModel | null = null;
  public usernameTooltip: CharacterTooltip;

  public chatTooltips: CharacterTooltip[] = [];

  constructor(private config: CharacterConfig) {
    super();
    this.usernameTooltip = new CharacterTooltip(
      this.config.isLocal
        ? {
            secondsToFadeOut: 10,
          }
        : {},
    );
    this.usernameTooltip.setText(this.config.username);
    this.add(this.usernameTooltip);

    // Check if operation was canceled before starting loading
    if (this.config.abortController?.signal.aborted) {
      console.log(`Character loading canceled before starting for ${this.config.characterId}`);
      return;
    }

    this.load()
      .then(() => {
        if (this.config.abortController?.signal.aborted) {
          return;
        }
        if (this.model?.mesh) {
          this.config.modelLoadedCallback();
        } else {
          console.error(
            `Character loading failed in constructor for ${this.config.username} (${this.config.characterId}):`,
          );
          if (this.config.modelLoadFailedCallback) {
            this.config.modelLoadFailedCallback(new Error("Model not loaded in constructor"));
          }
        }
        this.setTooltipHeights();
      })
      .catch((error) => {
        // Check if the error is due to cancellation
        if (this.config.abortController?.signal.aborted) {
          console.log(`Character loading canceled in constructor for ${this.config.characterId}`);
          return;
        }
        console.error(
          `Character loading failed in constructor for ${this.config.username} (${this.config.characterId}):`,
          error,
        );

        // Call the error callback if provided
        if (this.config.modelLoadFailedCallback) {
          this.config.modelLoadFailedCallback(error);
        }
      });
  }

  getColors(): Array<[number, number, number]> {
    return this.model?.getColors() || [];
  }

  updateCharacter(
    username: string,
    characterDescription: CharacterDescription | null,
    abortController: AbortController,
    onModelLoaded: () => void,
    onModelLoadFailed: (error: Error) => void,
  ) {
    if (!characterDescriptionMatches(this.config.characterDescription, characterDescription)) {
      this.config.characterDescription = characterDescription;
      this.load()
        .then(() => {
          // Check if operation was canceled after loading
          if (abortController.signal.aborted) {
            console.log(`Character update canceled for ${this.config.characterId}`);
            return;
          }
          this.setTooltipHeights();
          onModelLoaded();
        })
        .catch((error) => {
          // Check if the error is due to cancellation
          if (abortController.signal.aborted) {
            console.log(`Character update canceled during loading for ${this.config.characterId}`);
            return;
          }
          console.error(
            `Character update failed for ${this.config.username} (${this.config.characterId}):`,
            error,
          );

          // Call the error callback if provided
          if (onModelLoadFailed) {
            onModelLoadFailed(error);
          }
        });
    }
    if (this.config.username !== username) {
      this.config.username = username;
      this.usernameTooltip.setText(username);
      // Force the tooltip to show if the character's name changes
      this.usernameTooltip.show();
    }
  }

  private setTooltipHeights() {
    if (this.model && this.model.characterHeight) {
      let height = characterHeightToTooltipHeightOffset(this.model.characterHeight);
      this.usernameTooltip.setHeightOffset(height);
      height += this.usernameTooltip.scale.y;

      for (const chatTooltip of this.chatTooltips) {
        chatTooltip.setHeightOffset(height);
        height += chatTooltip.scale.y;
      }
    }
  }

  public static loadAnimations(
    characterModelLoader: CharacterModelLoader,
    animationConfig: AnimationConfig,
  ): Promise<LoadedAnimations> {
    // Helper to parse animation config (string or AnimationSettings) and extract metadata
    const parseConfig = (
      urlOrConfig: string | AnimationSettings,
      defaults: Partial<AnimationConfigMetadata> = {},
    ): { fileUrl: string; config: AnimationConfigMetadata } => {
      if (typeof urlOrConfig === "string") {
        return {
          fileUrl: urlOrConfig,
          config: {
            loop: defaults.loop ?? true,
            discardNonRotationTransform: defaults.discardNonRotationTransform ?? true,
            playbackSpeed: defaults.playbackSpeed ?? 1.0,
            transformRootBonePosition: defaults.transformRootBonePosition,
          },
        };
      }
      return {
        fileUrl: urlOrConfig.fileUrl,
        config: {
          loop: urlOrConfig.loop ?? true,
          discardNonRotationTransform: urlOrConfig.discardNonRotationTransform ?? true,
          playbackSpeed: urlOrConfig.playbackSpeed ?? 1.0,
          transformRootBonePosition: urlOrConfig.transformRootBonePosition,
        },
      };
    };

    // Parse all animation configurations
    const idleConfig = parseConfig(animationConfig.idleAnimationUrlOrConfig);
    const jogConfig = parseConfig(animationConfig.jogAnimationUrlOrConfig);
    const sprintConfig = parseConfig(animationConfig.sprintAnimationUrlOrConfig);
    const airConfig = parseConfig(animationConfig.airAnimationUrlOrConfig);
    const doubleJumpConfig = parseConfig(animationConfig.doubleJumpAnimationUrlOrConfig, {
      loop: false,
      playbackSpeed: 1.45,
    });

    return new Promise((resolve) => {
      // Load all animations
      const idleAnimation = characterModelLoader.loadAnimation(idleConfig.fileUrl);
      const jogAnimation = characterModelLoader.loadAnimation(jogConfig.fileUrl);
      const sprintAnimation = characterModelLoader.loadAnimation(sprintConfig.fileUrl);
      const airAnimation = characterModelLoader.loadAnimation(airConfig.fileUrl);
      const doubleJumpAnimation = characterModelLoader.loadAnimation(doubleJumpConfig.fileUrl);

      const animationPromises = [
        idleAnimation,
        jogAnimation,
        sprintAnimation,
        airAnimation,
        doubleJumpAnimation,
      ];

      // Handle optional slide animation
      let slideConfig: { fileUrl: string; config: AnimationConfigMetadata } | null = null;
      let slideAnimation: Promise<AnimationClip | null> | null = null;
      if (animationConfig.slideAnimationUrlOrConfig) {
        slideConfig = parseConfig(animationConfig.slideAnimationUrlOrConfig, { loop: false });
        slideAnimation = characterModelLoader.loadAnimation(slideConfig.fileUrl);
        animationPromises.push(slideAnimation);
      }

      resolve(
        Promise.all(animationPromises).then((animations) => {
          const loadedAnimations: LoadedAnimations = {
            idleAnimation: { clip: animations[0]!, config: idleConfig.config },
            jogAnimation: { clip: animations[1]!, config: jogConfig.config },
            sprintAnimation: { clip: animations[2]!, config: sprintConfig.config },
            airAnimation: { clip: animations[3]!, config: airConfig.config },
            doubleJumpAnimation: { clip: animations[4]!, config: doubleJumpConfig.config },
          };

          // Add slide animation if it was loaded
          if (slideAnimation && slideConfig && animations[5]) {
            loadedAnimations.slideAnimation = {
              clip: animations[5]!,
              config: slideConfig.config,
            };
          }

          return loadedAnimations;
        }),
      );
    });
  }

  private async load(): Promise<void> {
    // Check if operation was canceled before starting
    if (this.config.abortController?.signal.aborted) {
      console.log(`Character loading canceled for ${this.config.characterId}`);
      return;
    }

    const previousModel = this.model;
    if (previousModel && previousModel.mesh) {
      this.remove(previousModel.mesh);
    }
    this.model = new CharacterModel({
      characterDescription: this.config.characterDescription ?? {
        meshFileUrl: lowPolyLoDModelURL,
      },
      animationsPromise: this.config.animationsPromise,
      characterModelLoader: this.config.characterModelLoader,
      cameraManager: this.config.cameraManager,
      characterId: this.config.characterId,
      isLocal: this.config.isLocal,
      abortController: this.config.abortController,
    });

    try {
      await this.model.init();

      // Check if operation was canceled after loading
      if (this.config.abortController?.signal.aborted) {
        if (this.model) {
          this.model.dispose();
          this.model = null;
        }
        return;
      }

      if (this.model && this.model.mesh) {
        this.add(this.model.mesh);
      } else {
        console.warn(
          `Character model for ${this.config.username} (${this.config.characterId}) failed to load.`,
        );
      }
    } catch (error) {
      // Check if the error is due to cancellation
      if (this.config.abortController?.signal.aborted) {
        return;
      }
      console.error(
        `Character loading failed for ${this.config.username} (${this.config.characterId}):`,
        error,
      );
      throw error;
    }
  }

  public updateAnimation(targetAnimation: AnimationState) {
    this.model?.updateAnimation(targetAnimation);
  }

  public update(time: number, deltaTime: number) {
    if (!this.model) return;
    if (this.usernameTooltip) {
      this.usernameTooltip.update();
    }
    this.model.update(deltaTime);
  }

  public getPosition(): Vector3 {
    return this.position as unknown as Vector3;
  }

  public getRotation(): Euler {
    return this.rotation as unknown as Euler;
  }

  public setPosition(x: number, y: number, z: number) {
    this.position.set(x, y, z);
  }

  public setRotation(x: number, y: number, z: number, w: number) {
    this.rotation.setFromQuaternion(new Quaternion(x, y, z, w));
  }

  getCurrentAnimation(): AnimationState {
    return this.model?.currentAnimation || AnimationState.idle;
  }

  addChatBubble(message: string) {
    const tooltip = new CharacterTooltip({
      maxWidth: 1000,
      secondsToFadeOut: 10,
      color: new Color(0.125, 0.125, 0.125),
    });
    this.add(tooltip);
    this.chatTooltips.unshift(tooltip);
    tooltip.setText(message, () => {
      this.chatTooltips = this.chatTooltips.filter((t) => t !== tooltip);
      this.remove(tooltip);
      tooltip.dispose();
      this.setTooltipHeights();
    });
    if (this.config.isLocal) {
      // Show the character's name if they're local and they emit a chat bubble
      this.usernameTooltip.show();
    }
    this.setTooltipHeights();
  }

  public getMesh(): Object3D | null {
    return this.model?.mesh || null;
  }

  public getHeadWorldPosition(): Vector3 | null {
    if (this.model?.headBone) {
      const worldPosition = new Vector3();
      this.model.headBone.getWorldPosition(worldPosition);
      return worldPosition;
    }
    return null;
  }

  dispose() {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.usernameTooltip.dispose();
    for (const chatTooltip of this.chatTooltips) {
      chatTooltip.dispose();
    }
    this.chatTooltips = [];
  }
}
