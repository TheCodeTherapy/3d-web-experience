import { Texture, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
// eslint-disable-next-line import/no-unresolved
import dracoDecoderWasmBase64 from "base64:draco3d/draco_decoder.wasm";
// eslint-disable-next-line import/no-unresolved
import dracoEncoderWasmBase64 from "base64:draco3d/draco_encoder.wasm";
// @ts-ignore - draco3d doesn't have built-in TypeScript definitions
import draco3d from "draco3d";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

function base64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

const dracoDecoderWasmArrayBuffer = base64ToArrayBuffer(dracoDecoderWasmBase64);
const dracoEncoderWasmArrayBuffer = base64ToArrayBuffer(dracoEncoderWasmBase64);

import { GLTFLoadingWorkerBrowserCache } from "./GLTFLoadingWorkerBrowserCache";
import { GLTFWorkerRequest, GLTFWorkerResponse } from "./GLTFLoadingWorkerTypes";

const compressedImageFormats = [
  "image/ktx2",
  "image/ktx",
  "image/basis",
  "image/vnd-ms.dds",
  "image/dds",
];

class GLTFLoadingWorker {
  private io: WebIO | null = null;
  private sourceCanvas: OffscreenCanvas;
  private sourceCtx: OffscreenCanvasRenderingContext2D;
  private targetCanvas: OffscreenCanvas;
  private targetCtx: OffscreenCanvasRenderingContext2D;
  private cache: GLTFLoadingWorkerBrowserCache;

  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;

  constructor() {
    this.canvas = new OffscreenCanvas(1, 1);
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Could not get 2D context for OffscreenCanvas");
    }
    this.ctx = ctx;

    this.cache = new GLTFLoadingWorkerBrowserCache();

    // Initialize cache and WebIO with Draco support asynchronously
    this.initializeCache();
    this.initializeIO();

    // Initialize reusable canvases
    this.sourceCanvas = new OffscreenCanvas(1, 1);
    this.targetCanvas = new OffscreenCanvas(1, 1);

    const sourceCtx = this.sourceCanvas.getContext("2d", { willReadFrequently: true });
    const targetCtx = this.targetCanvas.getContext("2d", { willReadFrequently: true });

    if (!sourceCtx || !targetCtx) {
      throw new Error("Could not get 2D contexts");
    }

    this.sourceCtx = sourceCtx;
    this.targetCtx = targetCtx;
  }

  private async initializeCache(): Promise<void> {
    await this.cache.init();
  }

  private async initializeIO(): Promise<void> {
    // Create and register the Draco decoder module with embedded WASM
    const dracoDecoder = await draco3d.createDecoderModule({
      wasmBinary: dracoDecoderWasmArrayBuffer,
    });
    const dracoEncoder = await draco3d.createEncoderModule({
      wasmBinary: dracoEncoderWasmArrayBuffer,
    });

    this.io = new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      "draco3d.decoder": dracoDecoder,
      "draco3d.encoder": dracoEncoder,
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder,
    });
  }

  private async ensureIOReady(): Promise<WebIO> {
    // Wait for IO to be initialized
    while (this.io === null) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return this.io;
  }

  private async resizeImageData(
    imageData: ImageData,
    maxSize: number,
  ): Promise<{ data: Uint8Array; width: number; height: number }> {
    const { width: originalWidth, height: originalHeight } = imageData;

    // Calculate new dimensions maintaining aspect ratio
    const aspectRatio = originalWidth / originalHeight;
    let newWidth = originalWidth;
    let newHeight = originalHeight;

    if (originalWidth > maxSize) {
      newWidth = maxSize;
      newHeight = Math.round(newWidth / aspectRatio);
    }
    if (newHeight > maxSize) {
      newHeight = maxSize;
      newWidth = Math.round(newHeight * aspectRatio);
    }

    // Resize canvases if needed
    if (this.sourceCanvas.width !== originalWidth || this.sourceCanvas.height !== originalHeight) {
      this.sourceCanvas.width = originalWidth;
      this.sourceCanvas.height = originalHeight;
    }

    if (this.targetCanvas.width !== newWidth || this.targetCanvas.height !== newHeight) {
      this.targetCanvas.width = newWidth;
      this.targetCanvas.height = newHeight;
    }

    // Put original data and resize
    this.sourceCtx.putImageData(imageData, 0, 0);
    this.targetCtx.drawImage(this.sourceCanvas, 0, 0, newWidth, newHeight);

    // Convert to blob and then to array buffer
    const outputBlob = await this.targetCanvas.convertToBlob({ type: "image/png" });
    const data = await outputBlob.arrayBuffer();
    return {
      data: new Uint8Array(data),
      width: newWidth,
      height: newHeight,
    };
  }

  private async processTexture(texture: Texture, maxSize: number): Promise<void> {
    const image = texture.getImage() as Uint8Array<ArrayBuffer> | null;
    if (!image) {
      return;
    }

    const mimeType = texture.getMimeType();

    // Skip processing for compressed texture formats
    // These formats cannot be decoded by createImageBitmap and should be left as-is
    if (compressedImageFormats.includes(mimeType)) {
      return;
    }

    try {
      // Create ImageBitmap from the image buffer
      const blob = new Blob([image], { type: mimeType });
      const imageBitmap = await createImageBitmap(blob);

      if (this.canvas.width !== imageBitmap.width || this.canvas.height !== imageBitmap.height) {
        this.canvas.width = imageBitmap.width;
        this.canvas.height = imageBitmap.height;
      }
      this.ctx.drawImage(imageBitmap, 0, 0);
      const imageData = this.ctx.getImageData(0, 0, imageBitmap.width, imageBitmap.height);

      if (imageBitmap.width <= maxSize && imageBitmap.height <= maxSize) {
        // No resizing needed
      } else {
        // Resize if needed
        const { data } = await this.resizeImageData(imageData, maxSize);
        texture.setImage(data).setMimeType("image/png");
      }

      imageBitmap.close();
    } catch (error) {
      console.warn("Failed to process texture:", error);
    }
  }

  async loadGLTF(
    fileUrl: string,
    maxTextureSize: number,
    abortController?: AbortController,
  ): Promise<Uint8Array> {
    // Check if already canceled
    if (abortController?.signal.aborted) {
      throw new Error("Operation canceled");
    }

    // Try to get from cache first
    try {
      const cachedResult = await this.cache.get(fileUrl, maxTextureSize);
      if (cachedResult) {
        return new Uint8Array(cachedResult);
      }
    } catch (error) {
      console.warn("Cache lookup failed:", error);
    }

    // Check if canceled before fetch
    if (abortController?.signal.aborted) {
      throw new Error("Operation canceled");
    }

    // Retry logic for handling truncated responses
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if canceled before each attempt
        if (abortController?.signal.aborted) {
          throw new Error("Operation canceled");
        }

        // Add cache-busting query parameter on retry attempts
        let fetchUrl = fileUrl;
        if (attempt > 1) {
          const url = new URL(fetchUrl);
          url.searchParams.set("retry", attempt.toString());
          url.searchParams.set("t", Date.now().toString());
          fetchUrl = url.toString();
        }

        // Fetch the gLTF file with abort controller
        const response = await fetch(fetchUrl, {
          signal: abortController?.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch gLTF file: ${response.statusText}`);
        }

        // Check if canceled before processing
        if (abortController?.signal.aborted) {
          throw new Error("Operation canceled");
        }

        const buffer = await response.arrayBuffer();
        const asUint8Array = new Uint8Array(buffer);

        // Check for truncated response

        /*
          The content-length header can describe the encoded size of the response which can be smaller than
          the actual size of the response when it is received by this application code.

          Given this the only check we can do at this stage is that if the uncompressed size is smaller than the
          content-length header then something is wrong and we should retry.
        */
        const contentLength = response.headers.get("Content-Length");
        const expectedSize = contentLength ? parseInt(contentLength, 10) : null;
        if (expectedSize && asUint8Array.length < expectedSize) {
          const error = new Error(
            `Response truncated: expected ${expectedSize} bytes but got ${asUint8Array.length} bytes`,
          );
          console.error("Truncated response detected:", {
            fileUrl,
            attempt,
            expectedSize,
            actualSize: asUint8Array.length,
            contentType: response.headers.get("Content-Type"),
            responseCode: response.status,
          });

          if (attempt === maxRetries) {
            throw error;
          }

          lastError = error;
          continue; // Try again
        }

        // Check if canceled before parsing
        if (abortController?.signal.aborted) {
          throw new Error("Operation canceled");
        }

        // Parse the document
        const io = await this.ensureIOReady();
        const document = await io.readBinary(asUint8Array);

        // Check if canceled before texture processing
        if (abortController?.signal.aborted) {
          throw new Error("Operation canceled");
        }

        // Process all textures in the document
        const textures = document.getRoot().listTextures();

        for (const texture of textures) {
          // Check if canceled before processing each texture
          if (abortController?.signal.aborted) {
            throw new Error("Operation canceled");
          }
          await this.processTexture(texture, maxTextureSize);
        }

        // Check if canceled before writing
        if (abortController?.signal.aborted) {
          throw new Error("Operation canceled");
        }

        const result = (await io.writeBinary(document)) as Uint8Array<ArrayBuffer>;

        // Cache the result (don't cache if canceled)
        if (!abortController?.signal.aborted) {
          try {
            await this.cache.set(fileUrl, maxTextureSize, result.buffer);
          } catch (error) {
            console.warn("Failed to cache result:", error);
          }
        }

        return new Uint8Array(result);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on cancellation
        if (abortController?.signal.aborted || lastError.message === "Operation canceled") {
          throw lastError;
        }

        // Don't retry on non-truncation errors unless it's the first attempt
        if (attempt === maxRetries || !lastError.message.includes("truncated")) {
          throw lastError;
        }

        console.warn(`Fetch attempt ${attempt} failed, retrying...`, lastError.message);

        // Wait before retrying (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt - 1) * 100));
      }
    }

    throw lastError || new Error("Failed to load GLTF after retries");
  }
}

// Worker message handler
const worker = new GLTFLoadingWorker();

type Task = {
  id: string;
  fileUrl: string;
  maxTextureSize: number;
  abortController: AbortController;
};

// Worker concurrency manager
class WorkerConcurrencyManager {
  private readonly maxConcurrentRequests = 2;
  private activeRequests = 0;
  private requestQueue: Array<Task> = [];
  private requestMap = new Map<string, Task>();

  enqueue(task: Task) {
    this.requestMap.set(task.id, task);
    this.requestQueue.push(task);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    while (this.activeRequests < this.maxConcurrentRequests && this.requestQueue.length > 0) {
      const queueItem = this.requestQueue.shift()!;

      // Skip canceled requests
      if (queueItem.abortController.signal.aborted) {
        continue;
      }

      this.activeRequests++;

      try {
        const gltfBuffer = await worker.loadGLTF(
          queueItem.fileUrl,
          queueItem.maxTextureSize,
          queueItem.abortController,
        );
        const response: GLTFWorkerResponse = {
          id: queueItem.id,
          type: "success",
          gltfBuffer,
        };
        self.postMessage(response);
      } catch (error) {
        console.error("Error in task:", error);
        const response: GLTFWorkerResponse = {
          id: queueItem.id,
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        };
        self.postMessage(response);
      } finally {
        this.activeRequests--;
        this.requestMap.delete(queueItem.id);
        this.processQueue();
      }
    }
  }

  cancelRequest(id: string): void {
    // Check if it's an active request
    const activeTask = this.requestMap.get(id);
    if (activeTask) {
      activeTask.abortController.abort();
      this.requestMap.delete(id);
      return;
    }

    // Check if it's a queued request
    const queuedItem = this.requestQueue.find((item) => item.id === id);
    if (queuedItem) {
      // Remove from queue
      this.requestQueue = this.requestQueue.filter((item) => item.id !== id);
    }
  }

  getStats(): { active: number; queued: number; maxConcurrent: number } {
    return {
      active: this.activeRequests,
      queued: this.requestQueue.length,
      maxConcurrent: this.maxConcurrentRequests,
    };
  }
}

const concurrencyManager = new WorkerConcurrencyManager();

self.onmessage = async function (e: MessageEvent<GLTFWorkerRequest>) {
  const { id, type } = e.data;

  try {
    if (type === "load-gltf") {
      const { fileUrl, maxTextureSize } = e.data;
      if (!fileUrl || maxTextureSize === undefined) {
        throw new Error("fileUrl and maxTextureSize are required for load-gltf");
      }

      // Queue the request to respect concurrency limit
      concurrencyManager.enqueue({
        id,
        fileUrl,
        maxTextureSize,
        abortController: new AbortController(),
      });
    } else if (type === "cancel-load-gltf") {
      // Cancel the request if it exists
      concurrencyManager.cancelRequest(id);
      // Note: We don't send a response for cancellation messages
      // The original request will fail with an "Operation canceled" error
    } else {
      throw new Error(`Unknown request type: ${type}`);
    }
  } catch (error) {
    const response: GLTFWorkerResponse = {
      id,
      type: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };

    self.postMessage(response);
  }
};

// Workaround to make TypeScript accept that the default import is a string - esbuild will make this file into a bundled module
const placeholder = "";
export default placeholder;
