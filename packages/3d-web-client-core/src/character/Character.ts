import { Color, Group, Vector3 } from "three";

import { CameraManager } from "../camera/CameraManager";
import { Composer } from "../rendering/composer";

import { CharacterModel } from "./CharacterModel";
import { CharacterModelLoader } from "./CharacterModelLoader";
import { CharacterSpeakingIndicator } from "./CharacterSpeakingIndicator";
import { AnimationState } from "./CharacterState";
import { CharacterTooltip } from "./CharacterTooltip";

export type AnimationConfig = {
  idleAnimationFileUrl: string;
  jogAnimationFileUrl: string;
  sprintAnimationFileUrl: string;
  airAnimationFileUrl: string;
};

export type CharacterDescription = {
  meshFileUrl?: string;
  mmlCharacterUrl?: string;
  mmlCharacterString?: string;
} & (
  | {
      meshFileUrl: string;
    }
  | {
      mmlCharacterUrl: string;
    }
  | {
      mmlCharacterString: string;
    }
);

export type CharacterConfig = {
  username: string;
  characterDescription: CharacterDescription;
  animationConfig: AnimationConfig;
  characterModelLoader: CharacterModelLoader;
  characterId: number;
  modelLoadedCallback: () => void;
  cameraManager: CameraManager;
  composer: Composer;
  isLocal: boolean;
};

export class Character extends Group {
  private model: CharacterModel | null = null;
  public color: Color = new Color();
  public tooltip: CharacterTooltip;
  public speakingIndicator: CharacterSpeakingIndicator | null = null;

  constructor(private config: CharacterConfig) {
    super();
    this.tooltip = new CharacterTooltip();
    this.tooltip.setText(this.config.username, this.config.isLocal);
    this.add(this.tooltip);
    this.load().then(() => {
      this.config.modelLoadedCallback();
    });
  }

  updateCharacter(username: string, characterDescription: CharacterDescription) {
    this.config.username = username;
    this.config.characterDescription = characterDescription;
    this.load();
    this.tooltip.setText(username, this.config.isLocal);
  }

  private async load(): Promise<void> {
    const previousModel = this.model;
    this.model = new CharacterModel({
      characterDescription: this.config.characterDescription,
      animationConfig: this.config.animationConfig,
      characterModelLoader: this.config.characterModelLoader,
      cameraManager: this.config.cameraManager,
      characterId: this.config.characterId,
      isLocal: this.config.isLocal,
    });
    await this.model.init();
    if (previousModel && previousModel.mesh) {
      this.remove(previousModel.mesh!);
    }
    this.add(this.model.mesh!);
    if (this.speakingIndicator === null) {
      this.speakingIndicator = new CharacterSpeakingIndicator(this.config.composer.postPostScene);
    }
  }

  public updateAnimation(targetAnimation: AnimationState) {
    this.model?.updateAnimation(targetAnimation);
  }

  public update(time: number, deltaTime: number) {
    if (!this.model) return;
    if (this.tooltip) {
      this.tooltip.update(this.config.cameraManager.camera);
    }
    if (this.speakingIndicator) {
      this.speakingIndicator.setTime(time);
      if (this.model.mesh && this.model.headBone) {
        this.speakingIndicator.setBillboarding(
          this.model.headBone?.getWorldPosition(new Vector3()),
          this.config.cameraManager.camera,
        );
      }
    }
    this.model.update(deltaTime);
  }

  getCurrentAnimation(): AnimationState {
    return this.model?.currentAnimation || AnimationState.idle;
  }
}
