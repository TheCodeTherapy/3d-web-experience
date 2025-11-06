export class GLTFLoadingWorkerBrowserCache {
  private readonly cacheName = "gltf-processed-v1";
  private cache: Cache | null = null;

  async init(): Promise<void> {
    try {
      this.cache = await caches.open(this.cacheName);
    } catch (error) {
      console.warn("Cache API not available, cache will be disabled:", error);
    }
  }

  private generateCacheKey(fileUrl: string, maxTextureSize: number): string {
    // Create a unique URL that includes the processing parameters
    return `${fileUrl}?processed=true&maxTextureSize=${maxTextureSize}`;
  }

  async get(fileUrl: string, maxTextureSize: number): Promise<ArrayBuffer | null> {
    if (fileUrl.startsWith("data:")) {
      return null;
    }

    if (!this.cache) {
      console.warn("Cache not initialized");
      return null;
    }

    try {
      const cacheKey = this.generateCacheKey(fileUrl, maxTextureSize);
      const cachedResponse = await this.cache.match(cacheKey);

      if (cachedResponse) {
        return await cachedResponse.arrayBuffer();
      }
    } catch (error) {
      console.warn("Cache lookup failed:", error);
    }

    return null;
  }

  async set(fileUrl: string, maxTextureSize: number, data: ArrayBuffer): Promise<void> {
    if (fileUrl.startsWith("data:")) {
      return;
    }

    if (!this.cache) {
      return;
    }

    try {
      const cacheKey = this.generateCacheKey(fileUrl, maxTextureSize);
      const response = new Response(data, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Cache-Control": "max-age=86400", // 1 day
        },
      });

      await this.cache.put(cacheKey, response);
    } catch (error) {
      console.warn("Failed to cache processed GLTF:", error);
    }
  }
}
