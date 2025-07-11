import * as EssentialsPlugin from "@tweakpane/plugin-essentials";
import { BloomEffect, EffectComposer, EffectPass, ToneMappingEffect } from "postprocessing";
import { Scene, WebGLRenderer } from "three";
import { FolderApi, Pane } from "tweakpane";

import { CameraManager } from "../camera/CameraManager";
import { LocalController } from "../character/LocalController";
import { EventHandlerCollection } from "../input/EventHandlerCollection";
import type { Composer } from "../rendering/composer";
import { BrightnessContrastSaturation } from "../rendering/post-effects/bright-contrast-sat";
import { GaussGrainEffect } from "../rendering/post-effects/gauss-grain";
import { PostProcessingManager } from "../rendering/PostProcessingManager";
import { TimeManager } from "../time/TimeManager";

import { CameraFolder } from "./blades/cameraFolder";
import { CharacterControlsFolder } from "./blades/characterControlsFolder";
import { CharacterFolder } from "./blades/characterFolder";
// post processing effects ===================================================
import { BrightnessContrastSaturationFolder } from "./blades/effects/bcsFolder";
import { BloomAndGrainFolder } from "./blades/effects/bloomAndGrain";
import { SSAOFolder } from "./blades/effects/ssaoFolder";
import { ToneMappingFolder } from "./blades/effects/toneMappingFolder";
// end post processing effects ===============================================
import { EnvironmentFolder } from "./blades/environmentFolder";
import { PostProcessingFolder } from "./blades/postProcessingFolder";
import { RendererFolder, rendererValues } from "./blades/rendererFolder";
import { RendererStatsFolder } from "./blades/rendererStatsFolder";
import { setTweakpaneActive } from "./tweakPaneActivity";
import { tweakPaneStyle } from "./tweakPaneStyle";

export class TweakPane {
  private gui: Pane;

  private renderStatsFolder: RendererStatsFolder;
  private rendererFolder: RendererFolder;
  private postProcessingFolder: PostProcessingFolder;
  private postProcessingSettingsFolder: FolderApi;
  // post processing effects
  private toneMappingFolder: ToneMappingFolder;
  private ssaoFolder: SSAOFolder;
  private bcsFolder: BrightnessContrastSaturationFolder;
  private bloomAndGrainFolder: BloomAndGrainFolder;
  //
  private character: CharacterFolder;
  private environment: EnvironmentFolder;
  private camera: CameraFolder;
  private characterControls: CharacterControlsFolder;

  private export: FolderApi;

  private saveVisibilityInLocalStorage: boolean = true;
  public guiVisible: boolean = false;
  private tweakPaneWrapper: HTMLDivElement;
  private eventHandlerCollection: EventHandlerCollection;

  constructor(
    private holderElement: HTMLElement,
    private renderer: WebGLRenderer,
    private scene: Scene,
    private composer: Composer,
  ) {
    this.tweakPaneWrapper = document.createElement("div");
    this.tweakPaneWrapper.style.position = "fixed";
    this.tweakPaneWrapper.style.width = "400px";
    this.tweakPaneWrapper.style.height = "100%";
    this.tweakPaneWrapper.style.top = "0px";
    this.tweakPaneWrapper.style.right = "calc(-50vw)";
    this.tweakPaneWrapper.style.zIndex = "99";
    this.tweakPaneWrapper.style.overflow = "auto";
    this.tweakPaneWrapper.style.backgroundColor = "rgba(0, 0, 0, 0.66)";
    this.tweakPaneWrapper.style.paddingLeft = "5px";
    this.tweakPaneWrapper.style.boxShadow = "-7px 0px 12px rgba(0, 0, 0, 0.5)";
    this.tweakPaneWrapper.style.transition = "right cubic-bezier(0.83, 0, 0.17, 1) 0.7s";
    holderElement.appendChild(this.tweakPaneWrapper);

    this.gui = new Pane({ container: this.tweakPaneWrapper! });
    this.gui.registerPlugin(EssentialsPlugin);

    if (this.saveVisibilityInLocalStorage) {
      const localStorageGuiVisible = localStorage.getItem("guiVisible");
      if (localStorageGuiVisible !== null) {
        if (localStorageGuiVisible === "true") {
          this.guiVisible = true;
        } else if (localStorageGuiVisible === "false") {
          this.guiVisible = false;
        }
      }
    }

    const styleElement = document.createElement("style");
    styleElement.type = "text/css";
    styleElement.appendChild(document.createTextNode(tweakPaneStyle));
    document.head.appendChild(styleElement);

    this.renderStatsFolder = new RendererStatsFolder(this.gui, true);
    this.rendererFolder = new RendererFolder(this.gui, false);

    this.environment = new EnvironmentFolder(this.gui, false);
    this.camera = new CameraFolder(this.gui, false);
    this.characterControls = new CharacterControlsFolder(this.gui, false);

    this.postProcessingFolder = new PostProcessingFolder(this.gui, false);
    this.postProcessingSettingsFolder = this.gui.addFolder({
      title: "postProcessingSettings",
      expanded: false,
    });
    this.toneMappingFolder = new ToneMappingFolder(this.postProcessingSettingsFolder, false);
    this.ssaoFolder = new SSAOFolder(this.postProcessingSettingsFolder, false);
    this.bcsFolder = new BrightnessContrastSaturationFolder(
      this.postProcessingSettingsFolder,
      false,
    );
    this.bloomAndGrainFolder = new BloomAndGrainFolder(this.postProcessingSettingsFolder, false);
    this.character = new CharacterFolder(this.gui, false);

    this.toneMappingFolder.folder.hidden = rendererValues.toneMapping === 5 ? false : true;

    this.export = this.gui.addFolder({ title: "import / export", expanded: false });

    this.eventHandlerCollection = new EventHandlerCollection();

    const gui = this.gui as any;
    const paneElement: HTMLElement = gui.containerElem_;
    paneElement.style.right = this.guiVisible ? "0px" : "-450px";
    this.eventHandlerCollection.add(this.gui.element, "mouseenter", () => setTweakpaneActive(true));
    this.eventHandlerCollection.add(this.gui.element, "mousemove", () => setTweakpaneActive(true));
    this.eventHandlerCollection.add(this.gui.element, "mousedown", () => setTweakpaneActive(true));
    this.eventHandlerCollection.add(this.gui.element, "mouseleave", () =>
      setTweakpaneActive(false),
    );
    this.eventHandlerCollection.add(this.gui.element, "mouseup", () => setTweakpaneActive(false));
    this.eventHandlerCollection.add(window, "keydown", (e) => {
      this.processKey(e);
    });
  }

  private processKey(e: KeyboardEvent): void {
    if (e.key === "p") {
      this.toggleGUI();
    }
  }

  public setupRenderPane(
    composer: EffectComposer,
    n8aopass: any,
    toneMappingEffect: ToneMappingEffect,
    toneMappingPass: EffectPass,
    brightnessContrastSaturation: typeof BrightnessContrastSaturation,
    bloomEffect: BloomEffect,
    gaussGrainEffect: typeof GaussGrainEffect,
    hasLighting: boolean,
    updateSunValues: () => void,
    setHDR: () => void,
    setSkyboxAzimuthalAngle: (azimuthalAngle: number) => void,
    setSkyboxPolarAngle: (azimuthalAngle: number) => void,
    setAmbientLight: () => void,
    setFog: () => void,
    setSkyShaderValues: () => void,
  ): void {
    this.rendererFolder.setupChangeEvent(
      this.renderer,
      this.toneMappingFolder.folder,
      toneMappingPass,
    );

    this.toneMappingFolder.setupChangeEvent(toneMappingEffect);
    this.ssaoFolder.setupChangeEvent(composer, n8aopass);
    this.bcsFolder.setupChangeEvent(brightnessContrastSaturation);
    this.bloomAndGrainFolder.setupChangeEvent(bloomEffect, gaussGrainEffect);
    this.environment.setupChangeEvent(
      this.scene,
      setHDR,
      setSkyboxAzimuthalAngle,
      setSkyboxPolarAngle,
      setAmbientLight,
      setFog,
      setSkyShaderValues,
      updateSunValues,
    );
    this.environment.folder.hidden = hasLighting === false;

    const exportButton = this.export.addButton({ title: "export" });
    exportButton.on("click", () => {
      this.downloadSettingsAsJSON(this.gui.exportState());
    });
    const importButton = this.export.addButton({ title: "import" });
    importButton.on("click", () => {
      this.importSettingsFromJSON((settings) => {
        this.gui.importState(settings);
      });
    });
  }

  public dispose() {
    this.eventHandlerCollection.clear();
    this.gui.dispose();
    this.tweakPaneWrapper.remove();
  }

  public setupCamPane(cameraManager: CameraManager) {
    this.camera.setupChangeEvent(cameraManager);
  }

  public setupCharacterController(localController: LocalController) {
    this.characterControls.setupChangeEvent(localController);
  }

  public setupPostProcessingPane(postProcessingManager: PostProcessingManager): void {
    this.postProcessingFolder.setupChangeEvent(postProcessingManager);
  }

  public updateStats(timeManager: TimeManager): void {
    const postProcessingManager = (this.composer as any).postProcessingManager;
    if (postProcessingManager?.effectComposer) {
      this.renderStatsFolder.update(
        this.renderer,
        postProcessingManager.effectComposer,
        timeManager,
      );
    }

    // record frame time for benchmark if running
    if (this.postProcessingFolder.isBenchmarkRunning()) {
      this.postProcessingFolder.recordFrameTime();
    }
  }

  public updateCameraData(cameraManager: CameraManager) {
    this.camera.update(cameraManager);
  }

  public updateCharacterData(localController: LocalController) {
    this.characterControls.update(localController);
  }

  private formatDateForFilename(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-11
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}-${minutes}-${seconds}`;
  }

  private downloadSettingsAsJSON(settings: any): void {
    const jsonString = JSON.stringify(settings, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `settings ${this.formatDateForFilename()}.json`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  }

  private importSettingsFromJSON(callback: (settings: any) => void): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.addEventListener("change", (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          try {
            const settings = JSON.parse(loadEvent.target?.result as string);
            callback(settings);
          } catch (err) {
            console.error("Error parsing JSON:", err);
          }
        };
        reader.readAsText(file);
      }
    });
    input.click();
  }

  private toggleGUI(): void {
    this.guiVisible = !this.guiVisible;
    const gui = this.gui as any;
    const paneElement: HTMLElement = gui.containerElem_;
    paneElement.style.right = this.guiVisible ? "0px" : "-450px";
    if (this.saveVisibilityInLocalStorage) {
      localStorage.setItem("guiVisible", this.guiVisible === true ? "true" : "false");
    }
  }
}
