import { ModelLoader, ModelLoadResult } from "@mml-io/model-loader";
import { AnimationClip, Object3D } from "three";

import { GLTFLoadingWorkerPool } from "./GLTFLoadingWorkerPool";

export class CharacterModelLoader {
  private readonly modelLoader: ModelLoader = new ModelLoader();
  private workerPool: GLTFLoadingWorkerPool;

  constructor(private debug: boolean = false) {
    this.workerPool = new GLTFLoadingWorkerPool();
  }

  async loadModel(
    fileUrl: string,
    maxTextureSize: number,
    abortController?: AbortController,
  ): Promise<Object3D | null> {
    if (this.debug) {
      console.log(`Loading and processing ${fileUrl} with max texture size ${maxTextureSize}`);
    }

    try {
      const processedBuffer = await this.processGLTFInWorker(
        fileUrl,
        maxTextureSize,
        abortController,
      );
      return await this.loadFromBuffer(processedBuffer, fileUrl);
    } catch (error) {
      // Check if the error is due to cancellation
      if (abortController?.signal.aborted) {
        console.log(`Loading canceled for ${fileUrl}`);
        return null;
      }
      console.error(`Error loading model from ${fileUrl}:`, error);
      throw error;
    }
  }

  async loadAnimation(
    fileUrl: string,
    abortController?: AbortController,
  ): Promise<AnimationClip | null> {
    const animationResult = await this.modelLoader.load(fileUrl);
    if (abortController?.signal.aborted) {
      console.log(`Loading animation canceled for ${fileUrl}`);
      return null;
    }
    return animationResult.animations[0] as AnimationClip;
  }

  private async processGLTFInWorker(
    fileUrl: string,
    maxTextureSize: number,
    abortController?: AbortController,
  ): Promise<ArrayBuffer> {
    if (this.debug) {
      console.log(`Processing gLTF in worker: ${fileUrl}`);
    }

    const startTime = performance.now();

    try {
      const absoluteFileUrl = new URL(fileUrl, window.location.href).href;
      const processedBuffer = await this.workerPool.processGLTF(
        absoluteFileUrl,
        maxTextureSize,
        abortController,
      );
      const endTime = performance.now();

      if (this.debug) {
        console.log(`gLTF processing completed in ${(endTime - startTime).toFixed(2)}ms`);
      }

      return processedBuffer;
    } catch (error) {
      if (this.debug) {
        console.warn(
          `Worker processing failed for ${fileUrl}, falling back to regular loading:`,
          error,
        );
      }

      // Check if cancellation was requested
      if (abortController?.signal.aborted) {
        throw new Error("Operation canceled");
      }

      throw error;
    }
  }

  private async loadFromBuffer(buffer: ArrayBuffer, pathName: string): Promise<Object3D | null> {
    const modelLoadResult: ModelLoadResult = await this.modelLoader.loadFromBuffer(
      buffer,
      pathName,
    );

    return modelLoadResult.group as Object3D;
  }
}
