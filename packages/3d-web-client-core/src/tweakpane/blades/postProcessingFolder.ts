import { BladeController, View } from "@tweakpane/core";
import { BladeApi, FolderApi, TpChangeEvent } from "tweakpane";

import { PostProcessingManager, PP_GLOBALLY_ENABLED } from "../../rendering/PostProcessingManager";

export const postProcessingGlobalValues = {
  enabled: PP_GLOBALLY_ENABLED,
};

interface BenchmarkResults {
  withPostProcessing: {
    averageFrameTime: number;
    fps: number;
    frameCount: number;
  };
  withoutPostProcessing: {
    averageFrameTime: number;
    fps: number;
    frameCount: number;
  };
  difference: {
    frameTimeDiff: number;
    fpsDiff: number;
    performanceImpact: number; // percentage
  };
}

const benchmarkFrameCount = 480;
const benchmarkWarmupFrames = 120;

interface BenchmarkState {
  isRunning: boolean;
  currentPhase: "first" | "second" | "complete" | "idle";
  frameTimes: number[];
  frameCount: number;
  startTime: number;
  originalPPState: boolean;
  currentPPState: boolean;
  results?: BenchmarkResults;
  warmupFramesSkipped: number;
  lastFrameTime: number;
}

export class PostProcessingFolder {
  private folder: FolderApi;
  private effectToggleBindings: Map<string, any> = new Map();
  private globalToggleBinding: any;
  private benchmarkButton: any;
  private benchmarkStatusBinding: any;
  private benchmarkResultsFolder: FolderApi;
  private postProcessingManager?: PostProcessingManager;

  private benchmarkState: BenchmarkState = {
    isRunning: false,
    currentPhase: "idle",
    frameTimes: [],
    frameCount: 0,
    startTime: 0,
    originalPPState: true,
    currentPPState: true,
    warmupFramesSkipped: 0,
    lastFrameTime: 0,
  };

  private benchmarkStatus = { status: "Ready to benchmark" };
  private benchmarkData = {
    withPP_fps: "0.0",
    withPP_frameTime: "0.0ms",
    withoutPP_fps: "0.0",
    withoutPP_frameTime: "0.0ms",
    difference_fps: "0.0",
    difference_frameTime: "0.0ms",
    performanceImpact: "0.0%",
    testedFirst: "N/A",
  };

  constructor(parentFolder: FolderApi, enabled: boolean | undefined, expand: boolean = false) {
    this.folder = parentFolder.addFolder({ title: "postProcessing toggler", expanded: expand });
    postProcessingGlobalValues.enabled = enabled ?? PP_GLOBALLY_ENABLED;

    this.globalToggleBinding = this.folder.addBinding(postProcessingGlobalValues, "enabled", {
      label: "Global Post-Processing",
    });

    this.folder.addBlade({ view: "separator" });
    this.benchmarkButton = this.folder.addButton({ title: "Benchmark Performance" });
    this.benchmarkStatusBinding = this.folder.addBinding(this.benchmarkStatus, "status", {
      readonly: true,
      label: "Status",
    });
    this.benchmarkResultsFolder = this.folder.addFolder({
      title: "Benchmark Results",
      expanded: true,
    });
    this.benchmarkResultsFolder.hidden = true;

    this.setupBenchmarkResults();
    this.folder.addBlade({ view: "separator" });
  }

  private setupBenchmarkResults() {
    this.benchmarkResultsFolder.addBlade({ view: "separator" });
    this.benchmarkResultsFolder.addBinding(this.benchmarkData, "testedFirst", {
      readonly: true,
      label: "Tested First",
    });
    this.benchmarkResultsFolder.addBlade({ view: "separator" });
    this.benchmarkResultsFolder.addBinding(this.benchmarkData, "withPP_fps", {
      readonly: true,
      label: "With PP - FPS",
    });
    this.benchmarkResultsFolder.addBinding(this.benchmarkData, "withPP_frameTime", {
      readonly: true,
      label: "With PP - Frame Time",
    });
    this.benchmarkResultsFolder.addBlade({ view: "separator" });
    this.benchmarkResultsFolder.addBinding(this.benchmarkData, "withoutPP_fps", {
      readonly: true,
      label: "Without PP - FPS",
    });
    this.benchmarkResultsFolder.addBinding(this.benchmarkData, "withoutPP_frameTime", {
      readonly: true,
      label: "Without PP - Frame Time",
    });
    this.benchmarkResultsFolder.addBlade({ view: "separator" });
    this.benchmarkResultsFolder.addBinding(this.benchmarkData, "difference_fps", {
      readonly: true,
      label: "FPS Difference",
    });
    this.benchmarkResultsFolder.addBinding(this.benchmarkData, "difference_frameTime", {
      readonly: true,
      label: "Frame Time Difference",
    });
    this.benchmarkResultsFolder.addBinding(this.benchmarkData, "performanceImpact", {
      readonly: true,
      label: "Performance Impact",
    });
  }

  public setupChangeEvent(postProcessingManager: PostProcessingManager): void {
    this.postProcessingManager = postProcessingManager;

    postProcessingGlobalValues.enabled = postProcessingGlobalValues.enabled ?? PP_GLOBALLY_ENABLED;
    this.globalToggleBinding.on(
      "change",
      (e: TpChangeEvent<unknown, BladeApi<BladeController<View>>>) => {
        postProcessingManager.toggleGlobalPostProcessing(e.value as boolean);
        this.updateEffectFolderVisibility(e.value as boolean);
      },
    );

    this.benchmarkButton.on("click", () => {
      this.startBenchmark();
    });

    this.setupEffectToggles(postProcessingManager);
    this.updateEffectFolderVisibility(postProcessingGlobalValues.enabled);
  }

  private setupEffectToggles(postProcessingManager: PostProcessingManager): void {
    const effectStates = postProcessingManager.getAllEffectStates();

    effectStates.forEach((effectState) => {
      const effectToggle = { enabled: effectState.enabled };

      const binding = this.folder.addBinding(effectToggle, "enabled", {
        label: this.getEffectDisplayName(effectState.name),
      });

      binding.on("change", (e: TpChangeEvent<unknown, BladeApi<BladeController<View>>>) => {
        if (e.value) {
          postProcessingManager.enableEffect(effectState.name);
        } else {
          postProcessingManager.disableEffect(effectState.name);
        }
      });

      this.effectToggleBindings.set(effectState.name, { binding, state: effectToggle });
    });
  }

  private getEffectDisplayName(effectName: string): string {
    const displayNames: Record<string, string> = {
      n8ssao: "SSAO",
      fxaa: "FXAA",
      bloom: "Bloom",
      toneMapping: "Tone Mapping",
      bcs: "Brightness/Contrast/Saturation",
      grain: "Film Grain",
      smaa: "SMAA",
    };
    return displayNames[effectName] || effectName;
  }

  private updateEffectFolderVisibility(globalEnabled: boolean): void {
    this.effectToggleBindings.forEach((bindingData) => {
      bindingData.binding.hidden = !globalEnabled;
    });
  }

  public refreshEffectStates(postProcessingManager: PostProcessingManager): void {
    const effectStates = postProcessingManager.getAllEffectStates();

    effectStates.forEach((effectState) => {
      const bindingData = this.effectToggleBindings.get(effectState.name);
      if (bindingData) {
        bindingData.state.enabled = effectState.enabled;
        bindingData.binding.refresh();
      }
    });

    postProcessingGlobalValues.enabled = postProcessingManager.isGloballyEnabled;
    this.updateEffectFolderVisibility(postProcessingGlobalValues.enabled);
  }

  private startBenchmark(): void {
    if (!this.postProcessingManager || this.benchmarkState.isRunning) {
      return;
    }

    this.benchmarkState = {
      isRunning: true,
      currentPhase: "first",
      frameTimes: [],
      frameCount: 0,
      startTime: 0,
      originalPPState: this.postProcessingManager.isGloballyEnabled,
      currentPPState: this.postProcessingManager.isGloballyEnabled,
      warmupFramesSkipped: 0,
      lastFrameTime: 0,
    };

    this.benchmarkButton.hidden = true;
    this.benchmarkStatus.status = "Benchmarking... Phase 1/2 (warming up)";
    this.benchmarkResultsFolder.hidden = true;

    console.log(`Starting benchmark - Initial PP state: ${this.benchmarkState.originalPPState}`);
  }

  public recordFrameTime(): void {
    if (!this.benchmarkState.isRunning) {
      return;
    }

    const now = performance.now();

    // Initialize timing on first call
    if (this.benchmarkState.lastFrameTime === 0) {
      this.benchmarkState.lastFrameTime = now;
      return;
    }

    const frameTime = now - this.benchmarkState.lastFrameTime;
    this.benchmarkState.lastFrameTime = now;

    // Skip warmup frames to avoid initialization artifacts
    if (this.benchmarkState.warmupFramesSkipped < benchmarkWarmupFrames) {
      this.benchmarkState.warmupFramesSkipped++;
      const phaseNum = this.benchmarkState.currentPhase === "first" ? 1 : 2;
      this.benchmarkStatus.status = `Benchmarking... Phase ${phaseNum}/2 (warming up: ${this.benchmarkState.warmupFramesSkipped}/${benchmarkWarmupFrames})`;
      return;
    }

    // Record actual frame time
    this.benchmarkState.frameTimes.push(frameTime);
    this.benchmarkState.frameCount++;

    // Update status
    const phaseNum = this.benchmarkState.currentPhase === "first" ? 1 : 2;
    this.benchmarkStatus.status = `Benchmarking... Phase ${phaseNum}/2 (${this.benchmarkState.frameCount}/${benchmarkFrameCount})`;

    if (this.benchmarkState.frameCount >= benchmarkFrameCount) {
      this.onPhaseComplete();
    }
  }

  private onPhaseComplete(): void {
    if (this.benchmarkState.currentPhase === "first") {
      // store first phase results and start second phase
      this.storePhaseResults(this.benchmarkState.currentPPState, this.benchmarkState.frameTimes);

      // toggle post-processing state
      this.benchmarkState.currentPPState = !this.benchmarkState.currentPPState;
      this.postProcessingManager!.toggleGlobalPostProcessing(this.benchmarkState.currentPPState);

      // reset for second phase
      this.benchmarkState.currentPhase = "second";
      this.benchmarkState.frameTimes = [];
      this.benchmarkState.frameCount = 0;
      this.benchmarkState.warmupFramesSkipped = 0;
      this.benchmarkState.lastFrameTime = 0;

      this.benchmarkStatus.status = "Benchmarking... Phase 2/2 (warming up)";
      console.log(
        `Phase 1 complete - Switching to PP state: ${this.benchmarkState.currentPPState}`,
      );
    } else if (this.benchmarkState.currentPhase === "second") {
      // store second phase results and complete benchmark
      this.storePhaseResults(this.benchmarkState.currentPPState, this.benchmarkState.frameTimes);
      this.completeBenchmark();
    }
  }

  private storePhaseResults(ppEnabled: boolean, frameTimes: number[]): void {
    const averageFrameTime = frameTimes.reduce((sum, time) => sum + time, 0) / frameTimes.length;
    const fps = 1000 / averageFrameTime;

    const results = {
      averageFrameTime,
      fps,
      frameCount: frameTimes.length,
    };

    if (!this.benchmarkState.results) {
      this.benchmarkState.results = {
        withPostProcessing: { averageFrameTime: 0, fps: 0, frameCount: 0 },
        withoutPostProcessing: { averageFrameTime: 0, fps: 0, frameCount: 0 },
        difference: { frameTimeDiff: 0, fpsDiff: 0, performanceImpact: 0 },
      };
    }

    console.log(`Phase ${this.benchmarkState.currentPhase} results:`, {
      ppEnabled,
      averageFrameTime: averageFrameTime.toFixed(3),
      fps: fps.toFixed(3),
      frameCount: frameTimes.length,
      minFrameTime: Math.min(...frameTimes).toFixed(3),
      maxFrameTime: Math.max(...frameTimes).toFixed(3),
    });

    if (ppEnabled) {
      this.benchmarkState.results.withPostProcessing = results;
    } else {
      this.benchmarkState.results.withoutPostProcessing = results;
    }
  }

  private completeBenchmark(): void {
    if (!this.benchmarkState.results) return;

    // compute differences
    const withPP = this.benchmarkState.results.withPostProcessing;
    const withoutPP = this.benchmarkState.results.withoutPostProcessing;

    this.benchmarkState.results.difference = {
      frameTimeDiff: withPP.averageFrameTime - withoutPP.averageFrameTime,
      fpsDiff: withPP.fps - withoutPP.fps,
      performanceImpact:
        ((withPP.averageFrameTime - withoutPP.averageFrameTime) / withoutPP.averageFrameTime) * 100,
    };

    this.updateBenchmarkDisplay();

    // restore original post-processing state
    this.postProcessingManager!.toggleGlobalPostProcessing(this.benchmarkState.originalPPState);
    postProcessingGlobalValues.enabled = this.benchmarkState.originalPPState;

    // reset state
    this.benchmarkState.isRunning = false;
    this.benchmarkState.currentPhase = "complete";

    // show results and restore UI
    this.benchmarkButton.hidden = false;
    this.benchmarkStatus.status = "Benchmark complete";
    this.benchmarkResultsFolder.hidden = false;

    console.log("Benchmark completed - Final results:", {
      originalPPState: this.benchmarkState.originalPPState,
      withPostProcessing: {
        fps: withPP.fps.toFixed(3),
        frameTime: withPP.averageFrameTime.toFixed(3),
      },
      withoutPostProcessing: {
        fps: withoutPP.fps.toFixed(3),
        frameTime: withoutPP.averageFrameTime.toFixed(3),
      },
      difference: {
        fpsChange: this.benchmarkState.results.difference.fpsDiff.toFixed(3),
        frameTimeChange: this.benchmarkState.results.difference.frameTimeDiff.toFixed(3),
        performanceImpact:
          this.benchmarkState.results.difference.performanceImpact.toFixed(3) + "%",
      },
    });
  }

  private updateBenchmarkDisplay(): void {
    if (!this.benchmarkState.results) return;

    const { withPostProcessing, withoutPostProcessing, difference } = this.benchmarkState.results;

    this.benchmarkData.testedFirst = this.benchmarkState.originalPPState ? "With PP" : "Without PP";
    this.benchmarkData.withPP_fps = withPostProcessing.fps.toFixed(3);
    this.benchmarkData.withPP_frameTime = withPostProcessing.averageFrameTime.toFixed(3) + "ms";
    this.benchmarkData.withoutPP_fps = withoutPostProcessing.fps.toFixed(3);
    this.benchmarkData.withoutPP_frameTime =
      withoutPostProcessing.averageFrameTime.toFixed(3) + "ms";
    this.benchmarkData.difference_fps =
      (difference.fpsDiff > 0 ? "+" : "") + difference.fpsDiff.toFixed(3);
    this.benchmarkData.difference_frameTime =
      (difference.frameTimeDiff > 0 ? "+" : "") + difference.frameTimeDiff.toFixed(3) + "ms";
    this.benchmarkData.performanceImpact =
      (difference.performanceImpact > 0 ? "+" : "") + difference.performanceImpact.toFixed(3) + "%";
  }

  public isBenchmarkRunning(): boolean {
    return this.benchmarkState.isRunning;
  }
}
