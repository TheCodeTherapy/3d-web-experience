import { AnimationClip, LoadingManager, Object3D } from "three";
import { GLTF, GLTFLoader as ThreeGLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

class CachedGLTFLoader extends ThreeGLTFLoader {
  private blobCache: Map<string, string>;

  constructor(manager?: LoadingManager) {
    super(manager);
    this.blobCache = new Map();
  }

  setBlobUrl(originalUrl: string, blobUrl: string) {
    this.blobCache.set(originalUrl, blobUrl);
  }

  getBlobUrl(originalUrl: string): string | undefined {
    return this.blobCache.get(originalUrl);
  }

  load(
    url: string,
    onLoad: (gltf: GLTF) => void,
    onProgress?: ((event: ProgressEvent<EventTarget>) => void) | undefined,
    onError?: ((event: ErrorEvent) => void) | undefined,
  ): void {
    const blobUrl = this.getBlobUrl(url);
    if (blobUrl) {
      console.log(`Loading cached ${url.split("/").pop()}`);
      super.load(blobUrl, onLoad, onProgress, onError);
    } else {
      super.load(url, onLoad, onProgress, onError);
    }
  }
}

class LRUCache<K, V> {
  private maxSize: number;
  private cache: Map<K, V>;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key: K): V | undefined {
    const item = this.cache.get(key);
    if (item) {
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  set(key: K, value: V): void {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }
}

interface CachedModel {
  blob: Blob;
  originalExtension: string;
}

export class ModelLoader {
  private static instance: ModelLoader | null = null;

  private readonly loadingManager: LoadingManager;
  private readonly gltfLoader: CachedGLTFLoader;
  private modelCache: LRUCache<string, CachedModel>;
  private ongoingLoads: Map<string, Promise<Object3D | AnimationClip | undefined>> = new Map();

  constructor(maxCacheSize: number = 100) {
    this.loadingManager = new LoadingManager();
    this.gltfLoader = new CachedGLTFLoader(this.loadingManager);
    this.modelCache = new LRUCache(maxCacheSize);
  }

  /* TODO: decide between below lazy initialization or eager on this file's bottom export */
  static getInstance(): ModelLoader {
    if (!ModelLoader.instance) {
      ModelLoader.instance = new ModelLoader();
    }
    return ModelLoader.instance;
  }

  async load(
    fileUrl: string,
    fileType: "model" | "animation",
  ): Promise<Object3D | AnimationClip | undefined> {
    const cachedModel = this.modelCache.get(fileUrl);

    if (cachedModel) {
      const blobURL = URL.createObjectURL(cachedModel.blob);
      this.gltfLoader.setBlobUrl(fileUrl, blobURL);
      return this.loadFromUrl(fileUrl, fileType, cachedModel.originalExtension);
    } else {
      console.log(`Loading ${fileUrl} from server`);
      const ongoingLoad = this.ongoingLoads.get(fileUrl);
      if (ongoingLoad) return ongoingLoad;

      const loadPromise = fetch(fileUrl)
        .then((response) => response.blob())
        .then((blob) => {
          const originalExtension = fileUrl.split(".").pop() || "";
          this.modelCache.set(fileUrl, { blob, originalExtension });
          const blobURL = URL.createObjectURL(blob);
          this.ongoingLoads.delete(fileUrl);
          return this.loadFromUrl(blobURL, fileType, originalExtension);
        });

      this.ongoingLoads.set(fileUrl, loadPromise);
      return loadPromise;
    }
  }

  private async loadFromUrl(
    url: string,
    fileType: "model" | "animation",
    extension: string,
  ): Promise<Object3D | AnimationClip | undefined> {
    if (["gltf", "glb"].includes(extension)) {
      return new Promise((resolve, reject) => {
        this.gltfLoader.load(
          url,
          (object: GLTF) => {
            if (fileType === "model") {
              resolve(object.scene as Object3D);
            } else if (fileType === "animation") {
              resolve(object.animations[0] as AnimationClip);
            } else {
              const error = `Trying to load unknown ${fileType} type of element from file ${url}`;
              console.error(error);
              reject(error);
            }
          },
          undefined,
          (error) => {
            console.error(`Error loading GL(B|TF) from ${url}: ${error}`);
            reject(error);
          },
        );
      });
    } else {
      console.error(`Error: can't recognize ${url} extension: ${extension}`);
    }
  }
}

/* TODO: decide between below eager initialization or static getInstance() lazy one */
const MODEL_LOADER = ModelLoader.getInstance();
export default MODEL_LOADER;
