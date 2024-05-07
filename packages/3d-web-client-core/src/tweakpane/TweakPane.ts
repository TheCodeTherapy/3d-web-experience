import * as EssentialsPlugin from "@tweakpane/plugin-essentials";
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  NormalPass,
  SSAOEffect,
  ToneMappingEffect,
} from "postprocessing";
import { Scene, WebGLRenderer } from "three";
import { FolderApi, Pane } from "tweakpane";

import { BrightnessContrastSaturation } from "../rendering/post-effects/bright-contrast-sat";
import { GaussGrainEffect } from "../rendering/post-effects/gauss-grain";
import { Sun } from "../sun/Sun";
import { TimeManager } from "../time/TimeManager";

import { BrightnessContrastSaturationFolder } from "./blades/bcsFolder";
import { CharacterFolder } from "./blades/characterFolder";
import { EnvironmentFolder } from "./blades/environmentFolder";
import { PostExtrasFolder } from "./blades/postExtrasFolder";
import { RendererFolder, rendererValues } from "./blades/rendererFolder";
import { RendererStatsFolder } from "./blades/rendererStatsFolder";
import { SSAOFolder } from "./blades/ssaoFolder";
import { ToneMappingFolder } from "./blades/toneMappingFolder";
import { setTweakpaneActive } from "./tweakPaneActivity";
import { tweakPaneStyle } from "./tweakPaneStyle";

export class TweakPane {
  private gui: Pane;

  private renderStatsFolder: RendererStatsFolder;
  private rendererFolder: RendererFolder;
  private toneMappingFolder: ToneMappingFolder;
  private ssaoFolder: SSAOFolder;
  private bcsFolder: BrightnessContrastSaturationFolder;
  private postExtrasFolder: PostExtrasFolder;
  // @ts-ignore
  private character: CharacterFolder;
  private environment: EnvironmentFolder;

  private export: FolderApi;

  private saveVisibilityInLocalStorage: boolean = true;
  public guiVisible: boolean = false;

  constructor(
    private holderElement: HTMLElement,
    private renderer: WebGLRenderer,
    private scene: Scene,
    private composer: EffectComposer,
  ) {
    const tweakPaneWrapper = document.createElement("div");
    tweakPaneWrapper.style.position = "fixed";
    tweakPaneWrapper.style.width = "400px";
    tweakPaneWrapper.style.height = "100%";
    tweakPaneWrapper.style.top = "0px";
    tweakPaneWrapper.style.right = "calc(-50vw)";
    tweakPaneWrapper.style.zIndex = "99";
    tweakPaneWrapper.style.overflow = "auto";
    tweakPaneWrapper.style.backgroundColor = "rgba(0, 0, 0, 0.66)";
    tweakPaneWrapper.style.paddingLeft = "5px";
    tweakPaneWrapper.style.boxShadow = "-7px 0px 12px rgba(0, 0, 0, 0.5)";
    tweakPaneWrapper.style.transition = "right cubic-bezier(0.83, 0, 0.17, 1) 0.7s";
    holderElement.appendChild(tweakPaneWrapper);

    this.gui = new Pane({ container: tweakPaneWrapper! });
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
    this.toneMappingFolder = new ToneMappingFolder(this.gui, false);
    this.ssaoFolder = new SSAOFolder(this.gui, false);
    this.bcsFolder = new BrightnessContrastSaturationFolder(this.gui, false);
    this.postExtrasFolder = new PostExtrasFolder(this.gui, false);
    this.character = new CharacterFolder(this.gui, false);
    this.environment = new EnvironmentFolder(this.gui, false);

    this.toneMappingFolder.folder.hidden = rendererValues.toneMapping === 5 ? false : true;

    this.export = this.gui.addFolder({ title: "import / export", expanded: false });

    window.addEventListener("keydown", this.processKey.bind(this));
    this.setupRenderPane = this.setupRenderPane.bind(this);
    this.setupGUIListeners.bind(this)();
  }

  private setupGUIListeners(): void {
    const gui = this.gui as any;
    const paneElement: HTMLElement = gui.containerElem_;
    paneElement.style.right = this.guiVisible ? "0px" : "-450px";
    this.gui.element.addEventListener("mouseenter", () => setTweakpaneActive(true));
    this.gui.element.addEventListener("mousedown", () => setTweakpaneActive(true));
    this.gui.element.addEventListener("mouseup", () => setTweakpaneActive(false));
    this.gui.element.addEventListener("mouseleave", () => setTweakpaneActive(false));
  }

  private processKey(e: KeyboardEvent): void {
    if (e.key === "p") this.toggleGUI();
  }

  public setupRenderPane(
    composer: EffectComposer,
    normalPass: NormalPass,
    ppssaoEffect: SSAOEffect,
    ppssaoPass: EffectPass,
    n8aopass: any,
    toneMappingEffect: ToneMappingEffect,
    toneMappingPass: EffectPass,
    brightnessContrastSaturation: typeof BrightnessContrastSaturation,
    bloomEffect: BloomEffect,
    gaussGrainEffect: typeof GaussGrainEffect,
    hasLighting: boolean,
    sun: Sun | null,
    setHDR: () => void,
    setAmbientLight: () => void,
    setFog: () => void,
  ): void {
    // RenderOptions
    this.rendererFolder.setupChangeEvent(
      this.scene,
      this.renderer,
      this.toneMappingFolder.folder,
      toneMappingPass,
    );

    this.toneMappingFolder.setupChangeEvent(toneMappingEffect);
    this.ssaoFolder.setupChangeEvent(composer, normalPass, ppssaoEffect, ppssaoPass, n8aopass);
    this.bcsFolder.setupChangeEvent(brightnessContrastSaturation);
    this.postExtrasFolder.setupChangeEvent(bloomEffect, gaussGrainEffect);
    this.environment.setupChangeEvent(setHDR, setAmbientLight, setFog, sun);
    this.environment.folder.hidden = hasLighting === false || sun === null;

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

  public updateStats(timeManager: TimeManager): void {
    this.renderStatsFolder.update(this.renderer, this.composer, timeManager);
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
