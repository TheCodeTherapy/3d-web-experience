import { BladeController, View } from "@tweakpane/core";
import { BladeApi, FolderApi, TpChangeEvent } from "tweakpane";

import { LocalController } from "../../character/LocalController";

export const characterControllerValues = {
  gravity: 37,
  // jumpForce: 18,
  // doubleJumpForce: 17.7,
  jumpForce: 17,
  doubleJumpForce: 16.7,
  coyoteJump: 120,
  airResistance: 0.5,
  groundResistance: 0,
  airControlModifier: 0.05,
  // groundWalkControl: 0.75, // fast (original)
  // groundRunControl: 1.0, // fast (original)
  // groundWalkControl: 0.4, // no foot sliding
  // groundRunControl: 0.55, // no foot sliding
  groundWalkControl: 0.625, // in between
  groundRunControl: 0.8, // in between
  baseControlMultiplier: 200,
  minimumSurfaceAngle: 0.905,
};

export const characterControllerOptions = {
  gravity: { min: 1, max: 100, step: 0.05 },
  jumpForce: { min: 1, max: 50, step: 0.05 },
  doubleJumpForce: { min: 1, max: 50, step: 0.05 },
  coyoteJump: { min: 60, max: 200, step: 1 },
  airResistance: { min: 0.01, max: 0.9, step: 0.01 },
  groundResistance: { min: -100, max: 0, step: 1 },
  airControlModifier: { min: 0.001, max: 0.15, step: 0.01 },
  groundWalkControl: { min: 0.1, max: 1.5, step: 0.01 },
  groundRunControl: { min: 0.5, max: 2.0, step: 0.01 },
  baseControlMultiplier: { min: 150, max: 300, step: 1 },
  minimumSurfaceAngle: { min: 0.254, max: 1, step: 0.001 },
};

type CharacterData = {
  position: string;
  onGround: string;
  canJump: string;
  canDoubleJump: string;
  jumpCount: string;
  coyoteTime: string;
  coyoteJumped: string;
};

export class CharacterControlsFolder {
  public folder: FolderApi;

  private characterData: CharacterData = {
    position: "(0, 0, 0)",
    onGround: "false",
    canJump: "false",
    canDoubleJump: "false",
    jumpCount: "0",
    coyoteTime: "false",
    coyoteJumped: "false",
  };

  constructor(parentFolder: FolderApi, expand: boolean = false) {
    this.folder = parentFolder.addFolder({ title: "character", expanded: expand });
    this.folder.addBinding(this.characterData, "position", { readonly: true });
    this.folder.addBinding(this.characterData, "onGround", { readonly: true });
    this.folder.addBinding(this.characterData, "canJump", { readonly: true });
    this.folder.addBinding(this.characterData, "canDoubleJump", { readonly: true });
    this.folder.addBinding(this.characterData, "jumpCount", { readonly: true });
    this.folder.addBinding(this.characterData, "coyoteTime", { readonly: true });
    this.folder.addBinding(this.characterData, "coyoteJumped", { readonly: true });
    this.folder.addBinding(
      characterControllerValues,
      "gravity",
      characterControllerOptions.gravity,
    );
    this.folder.addBinding(
      characterControllerValues,
      "jumpForce",
      characterControllerOptions.jumpForce,
    );
    this.folder.addBinding(
      characterControllerValues,
      "doubleJumpForce",
      characterControllerOptions.doubleJumpForce,
    );
    this.folder.addBinding(
      characterControllerValues,
      "coyoteJump",
      characterControllerOptions.coyoteJump,
    );
    this.folder.addBinding(
      characterControllerValues,
      "airResistance",
      characterControllerOptions.airResistance,
    );
    this.folder.addBinding(
      characterControllerValues,
      "groundResistance",
      characterControllerOptions.groundResistance,
    );
    this.folder.addBinding(
      characterControllerValues,
      "airControlModifier",
      characterControllerOptions.airControlModifier,
    );
    this.folder.addBinding(
      characterControllerValues,
      "groundWalkControl",
      characterControllerOptions.groundWalkControl,
    );
    this.folder.addBinding(
      characterControllerValues,
      "groundRunControl",
      characterControllerOptions.groundRunControl,
    );
    this.folder.addBinding(
      characterControllerValues,
      "baseControlMultiplier",
      characterControllerOptions.baseControlMultiplier,
    );
    this.folder.addBinding(
      characterControllerValues,
      "minimumSurfaceAngle",
      characterControllerOptions.minimumSurfaceAngle,
    );
  }

  public setupChangeEvent(localController: LocalController): void {
    this.folder.on("change", (e: TpChangeEvent<unknown, BladeApi<BladeController<View>>>) => {
      const target = (e.target as any).key;
      if (!target) return;
      switch (target) {
        case "gravity": {
          const value = e.value as number;
          localController.gravity = value * -1;
          break;
        }
        case "jumpForce": {
          const value = e.value as number;
          localController.jumpForce = value;
          break;
        }
        case "doubleJumpForce": {
          const value = e.value as number;
          localController.doubleJumpForce = value;
          break;
        }
        case "coyoteJump": {
          const value = e.value as number;
          localController.coyoteTimeThreshold = value;
          break;
        }
        case "airResistance": {
          const value = e.value as number;
          localController.airResistance = value;
          break;
        }
        case "groundResistance": {
          const value = e.value as number;
          localController.groundResistance = 0.99999999 + value * 1e-6;
          break;
        }
        case "airControlModifier": {
          const value = e.value as number;
          localController.airControlModifier = value;
          break;
        }
        case "groundWalkControl": {
          const value = e.value as number;
          localController.groundWalkControl = value;
          break;
        }
        case "groundRunControl": {
          const value = e.value as number;
          localController.groundRunControl = value;
          break;
        }
        case "baseControlMultiplier": {
          const value = e.value as number;
          localController.baseControl = value;
          break;
        }
        case "minimumSurfaceAngle": {
          const value = e.value as number;
          localController.minimumSurfaceAngle = value;
          break;
        }
        default:
          break;
      }
    });
  }

  public update(localController: LocalController): void {
    const { x, y, z } = localController.latestPosition;
    this.characterData.position = `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`;
    this.characterData.onGround = `${localController.characterOnGround}`;
    this.characterData.canJump = `${localController.canJump || localController.coyoteTime ? "true" : "false"}`;
    this.characterData.canDoubleJump = `${localController.canDoubleJump}`;
    this.characterData.jumpCount = `${localController.jumpCounter}`;
    this.characterData.coyoteTime = `${localController.coyoteTime}`;
    this.characterData.coyoteJumped = `${localController.coyoteJumped}`;
  }
}
