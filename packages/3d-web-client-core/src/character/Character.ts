import { Color, Group, Vector3 } from "three";

import { CameraManager } from "../camera/CameraManager";
import { Composer } from "../rendering/composer";

import { CharacterModel } from "./CharacterModel";
import { CharacterModelLoader } from "./CharacterModelLoader";
import { CharacterSpeakingIndicator } from "./CharacterSpeakingIndicator";
import { AnimationState } from "./CharacterState";
import { CharacterTooltip } from "./CharacterTooltip";

export type AnimationSettings = {
  fileUrl: string;
  loop?: boolean;
  discardNonRotationTransform?: boolean;
  playbackSpeed?: number;
};

export type AnimationConfig = {
  idleAnimation: AnimationSettings;
  jogAnimation: AnimationSettings;
  sprintAnimation: AnimationSettings;
  airAnimation: AnimationSettings;
  doubleJumpAnimation: AnimationSettings;
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
  characterDescription: CharacterDescription;
  animationConfig: AnimationConfig;
  characterModelLoader: CharacterModelLoader;
  characterId: number;
  modelLoadedCallback: () => void;
  cameraManager: CameraManager;
  composer: Composer;
  isLocal: boolean;
};

function characterHeightToTooltipHeightOffset(characterHeight: number): number {
  return characterHeight - 0.4 + 0.1;
}

function characterDescriptionMatches(a: CharacterDescription, b: CharacterDescription): boolean {
  return (
    a.meshFileUrl === b.meshFileUrl &&
    a.mmlCharacterString === b.mmlCharacterString &&
    a.mmlCharacterUrl === b.mmlCharacterUrl
  );
}

export class Character extends Group {
  private model: CharacterModel | null = null;
  public color: Color = new Color();
  public tooltip: CharacterTooltip;
  public speakingIndicator: CharacterSpeakingIndicator | null = null;

  public chatTooltips: CharacterTooltip[] = [];

  constructor(private config: CharacterConfig) {
    super();
    this.tooltip = new CharacterTooltip(
      this.config.isLocal
        ? {
            secondsToFadeOut: 10,
          }
        : {},
    );
    this.tooltip.setText(this.config.username);
    this.add(this.tooltip);
    this.load().then(() => {
      this.config.modelLoadedCallback();
      this.setTooltipHeights();
    });
  }

  updateCharacter(username: string, characterDescription: CharacterDescription) {
    if (!characterDescriptionMatches(this.config.characterDescription, characterDescription)) {
      this.config.characterDescription = characterDescription;
      this.load().then(() => {
        this.setTooltipHeights();
      });
    }
    if (this.config.username !== username) {
      this.config.username = username;
      this.tooltip.setText(username);
      // Force the tooltip to show if the character's name changes
      this.tooltip.show();
    }
  }

  private setTooltipHeights() {
    if (this.model && this.model.characterHeight) {
      let height = characterHeightToTooltipHeightOffset(this.model.characterHeight);
      this.tooltip.setHeightOffset(height);
      height += this.tooltip.scale.y;

      for (const chatTooltip of this.chatTooltips) {
        chatTooltip.setHeightOffset(height);
        height += chatTooltip.scale.y;
      }
    }
  }

  private async load(): Promise<void> {
    const previousModel = this.model;
    if (previousModel && previousModel.mesh) {
      this.remove(previousModel.mesh);
    }
    this.model = new CharacterModel({
      characterDescription: this.config.characterDescription,
      animationConfig: this.config.animationConfig,
      characterModelLoader: this.config.characterModelLoader,
      cameraManager: this.config.cameraManager,
      characterId: this.config.characterId,
      isLocal: this.config.isLocal,
    });
    await this.model.init();
    if (this.model.mesh) {
      this.add(this.model.mesh);
    }
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
      this.tooltip.update();
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
      this.setTooltipHeights();
    });
    if (this.config.isLocal) {
      // Show the character's name if they're local and they emit a chat bubble
      this.tooltip.show();
    }
    this.setTooltipHeights();
  }
}
