import { Color, Vector3 } from "three";

import { CameraManager } from "../camera/CameraManager";
import { CollisionsManager } from "../collisions/CollisionsManager";
import { KeyInputManager } from "../input/KeyInputManager";
import { TimeManager } from "../time/TimeManager";

import { CharacterModel } from "./CharacterModel";
import { CharacterTooltip } from "./CharacterTooltip";
import { LocalController } from "./LocalController";

export type CharacterDescription = {
  meshFileUrl: string;
  idleAnimationFileUrl: string;
  jogAnimationFileUrl: string;
  sprintAnimationFileUrl: string;
  airAnimationFileUrl: string;
  modelScale: number;
};

export class Character {
  public controller: LocalController | null = null;

  public name: string | null = null;
  public model: CharacterModel | null = null;
  public color: Color = new Color();

  public position: Vector3 = new Vector3();

  public tooltip: CharacterTooltip | null = null;

  constructor(
    private readonly characterDescription: CharacterDescription,
    private readonly id: number,
    private readonly isLocal: boolean,
    private readonly modelLoadedCallback: () => void,
    private readonly collisionsManager: CollisionsManager,
    private readonly keyInputManager: KeyInputManager,
    private readonly cameraManager: CameraManager,
    private readonly timeManager: TimeManager,
  ) {
    this.load();
  }

  private async load(): Promise<void> {
    this.model = new CharacterModel(this.characterDescription);
    await this.model.init();
    if (this.tooltip === null) {
      this.tooltip = new CharacterTooltip(this.model.mesh!);
    }
    this.color = this.model.material.colorsCube216[this.id];
    if (this.isLocal) {
      this.controller = new LocalController(
        this.model,
        this.id,
        this.collisionsManager,
        this.keyInputManager,
        this.cameraManager,
        this.timeManager,
      );
    }
    this.modelLoadedCallback();
  }

  public update(time: number) {
    if (!this.model) return;
    if (this.tooltip) {
      this.tooltip.update(this.cameraManager.camera);
    }
    this.model.mesh!.getWorldPosition(this.position);
    if (typeof this.model.material.uniforms.time !== "undefined") {
      this.model.material.uniforms.time.value = time;
      this.model.material.uniforms.diffuseRandomColor.value = this.color;
      this.model.material.update();
    }
  }
}
