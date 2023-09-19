import { EffectComposer } from "postprocessing";
import { WebGLRenderer } from "three";
import { FolderApi } from "tweakpane";

import { TimeManager } from "../../time/TimeManager";

type StatsData = {
  triangles: string;
  geometries: string;
  textures: string;
  shaders: string;
  postPasses: string;
  drawCalls: string;
  rawDeltaTime: string;
  deltaTime: string;
  FPS: string;
};

export class RendererStatsFolder {
  private folder: FolderApi;
  private performance: FolderApi;
  private defails: FolderApi;

  private statsData: StatsData = {
    triangles: "0",
    geometries: "0",
    textures: "0",
    shaders: "0",
    postPasses: "0",
    drawCalls: "0",
    rawDeltaTime: "0",
    deltaTime: "0",
    FPS: "0",
  };

  constructor(parentFolder: FolderApi, expanded: boolean = true) {
    this.folder = parentFolder.addFolder({ title: "renderStats", expanded: expanded });
    this.performance = this.folder.addFolder({ title: "performance", expanded: true });
    this.defails = this.folder.addFolder({ title: "pipeline details", expanded: false });
    this.folder.addBlade({ view: "separator" });

    this.performance.addBinding(this.statsData, "FPS", { readonly: true });
    this.performance.addBinding(this.statsData, "deltaTime", { readonly: true });
    this.performance.addBinding(this.statsData, "rawDeltaTime", { readonly: true });

    this.defails.addBinding(this.statsData, "triangles", { readonly: true });
    this.defails.addBinding(this.statsData, "geometries", { readonly: true });
    this.defails.addBinding(this.statsData, "textures", { readonly: true });
    this.defails.addBinding(this.statsData, "shaders", { readonly: true });
    this.defails.addBinding(this.statsData, "postPasses", { readonly: true });
    this.defails.addBinding(this.statsData, "drawCalls", { readonly: true });
  }

  public update(renderer: WebGLRenderer, composer: EffectComposer, timeManager: TimeManager): void {
    const { geometries, textures } = renderer.info.memory;
    const { triangles, calls } = renderer.info.render;
    this.statsData.triangles = triangles.toString();
    this.statsData.geometries = geometries.toString();
    this.statsData.textures = textures.toString();
    this.statsData.shaders = renderer.info.programs!.length.toString();
    this.statsData.postPasses = composer.passes.length.toString();
    this.statsData.drawCalls = calls.toString();
    this.statsData.rawDeltaTime = (
      Math.round(timeManager.rawDeltaTime * 100000) / 100000
    ).toString();
    this.statsData.deltaTime = (Math.round(timeManager.deltaTime * 100000) / 100000).toString();
    this.statsData.FPS = timeManager.fps.toString();
  }
}
