// Import the worker as a URL using the esbuild plugin
import gltfWorkerUrl from "./GLTFLoadingWorker.worker";
import { GLTFWorkerRequest, GLTFWorkerResponse } from "./GLTFLoadingWorkerTypes";

/**
 * GLTFLoadingWorkerPool - gLTF loading and texture processing using Web Workers
 *
 * Features:
 * - Loads gLTF files entirely in workers (off main thread)
 * - Uses gltf-transform for gLTF manipulation
 * - Processes and resizes textures in the worker
 * - Caches processed gLTF files
 */
export class GLTFLoadingWorkerPool {
  private workers: Worker[] = [];
  private activeJobs = new Map<
    string,
    {
      resolve: (result: ArrayBuffer) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
      worker: Worker;
      abortController?: AbortController;
      fileUrl: string;
    }
  >();
  private workerIndex = 0;
  private readonly maxWorkers = Math.min(navigator.hardwareConcurrency || 4, 2);

  constructor() {
    // Create worker pool using the compiled worker URL
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker(gltfWorkerUrl);
      worker.onmessage = this.handleWorkerMessage.bind(this);
      worker.onerror = this.handleWorkerError.bind(this);
      this.workers.push(worker);
    }
  }

  private handleWorkerMessage(e: MessageEvent<GLTFWorkerResponse>): void {
    if (!e.data) {
      return;
    }
    const { id, type } = e.data;

    const job = this.activeJobs.get(id);
    if (!job) {
      console.warn(`Received message for unknown job ID: ${id}`);
      return;
    }

    // Clear timeout and remove job
    clearTimeout(job.timeout);
    this.activeJobs.delete(id);

    if (type === "success") {
      const { gltfBuffer } = e.data;
      const asArrayBuffer = gltfBuffer.buffer as ArrayBuffer;
      job.resolve(asArrayBuffer);
    } else if (type === "error") {
      const { error } = e.data;
      job.reject(new Error(error || "Unknown worker error"));
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    console.error("gLTF texture worker error:", error);
  }

  private getNextWorker(): Worker {
    const worker = this.workers[this.workerIndex];
    this.workerIndex = (this.workerIndex + 1) % this.workers.length;
    return worker;
  }

  public async processGLTF(
    fileUrl: string,
    maxTextureSize: number,
    abortController?: AbortController,
  ): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const worker = this.getNextWorker();
      const id = `gltf_${Date.now()}_${Math.random()}`;
      const message: GLTFWorkerRequest = {
        id,
        type: "load-gltf",
        fileUrl,
        maxTextureSize,
      };

      // Set up timeout
      const timeout = setTimeout(() => {
        if (this.activeJobs.has(id)) {
          this.activeJobs.delete(id);
          reject(new Error("gLTF process timeout"));
        }
      }, 60000);

      // Set up cancellation handler
      let abortHandler: (() => void) | undefined;
      if (abortController) {
        if (abortController.signal.aborted) {
          // Already canceled
          clearTimeout(timeout);
          reject(new Error("Operation canceled"));
          return;
        }

        abortHandler = () => {
          const existingJob = this.activeJobs.get(id);
          if (existingJob) {
            // Clear timeout and remove job
            clearTimeout(timeout);
            this.activeJobs.delete(id);

            // Send cancel message to worker
            existingJob.worker.postMessage({
              id,
              type: "cancel-load-gltf",
            } satisfies GLTFWorkerRequest);
            reject(new Error("Operation canceled"));
          }
        };
        abortController.signal.addEventListener("abort", abortHandler);
      }

      this.activeJobs.set(id, {
        resolve: (result: ArrayBuffer) => {
          if (abortHandler && abortController) {
            abortController.signal.removeEventListener("abort", abortHandler);
          }
          resolve(result);
        },
        reject: (error: Error) => {
          if (abortHandler && abortController) {
            abortController.signal.removeEventListener("abort", abortHandler);
          }
          reject(error);
        },
        worker,
        timeout,
        abortController,
        fileUrl,
      });
      worker.postMessage(message satisfies GLTFWorkerRequest);
    });
  }

  public dispose(): void {
    // Clear active jobs and their timeouts
    for (const [id, job] of this.activeJobs) {
      clearTimeout(job.timeout);
      // Clean up abort listeners if they exist
      if (job.abortController && job.abortController.signal) {
        // Note: We can't remove specific listeners without references, but they will be cleaned up
        // when the AbortController is garbage collected
      }
      job.reject(new Error("GLTFTextureWorkerPool disposed"));
    }
    this.activeJobs.clear();

    // Terminate workers
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
  }
}

// Legacy export for backwards compatibility
export const TextureWorkerPool = GLTFLoadingWorkerPool;
