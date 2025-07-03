import { ModelLoader, ModelLoadResult } from "@mml-io/model-loader";
import { AnimationClip, Object3D } from "three";
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

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

export class CharacterModelLoader {
  private readonly modelLoader: ModelLoader = new ModelLoader();
  private modelCache: LRUCache<string, CachedModel>;
  private ongoingLoads: Map<string, Promise<CachedModel>> = new Map();

  constructor(
    maxCacheSize: number = 100,
    private debug: boolean = false,
  ) {
    this.modelCache = new LRUCache(maxCacheSize);
  }

  async load(fileUrl: string, fileType: "model"): Promise<Object3D | undefined>;
  async load(fileUrl: string, fileType: "animation"): Promise<AnimationClip | undefined>;
  async load(
    fileUrl: string,
    fileType: "model" | "animation",
  ): Promise<Object3D | AnimationClip | undefined> {
    const cachedModel = this.modelCache.get(fileUrl);

    if (cachedModel) {
      return this.loadFromUrl(fileUrl, fileType, cachedModel.originalExtension);
    } else {
      if (this.debug === true) {
        console.log(`Loading ${fileUrl} from server`);
      }
      const ongoingLoad = this.ongoingLoads.get(fileUrl);
      if (ongoingLoad)
        return ongoingLoad.then((loadedModel) => {
          const blobURL = URL.createObjectURL(loadedModel.blob);
          return this.loadFromUrl(blobURL, fileType, loadedModel.originalExtension);
        });

      const loadPromise: Promise<CachedModel> = fetch(fileUrl)
        .then((response) => response.blob())
        .then((blob) => {
          const originalExtension = fileUrl.split(".").pop() || "";
          const cached = { blob, originalExtension };
          this.modelCache.set(fileUrl, cached);
          this.ongoingLoads.delete(fileUrl);
          return cached;
        });

      this.ongoingLoads.set(fileUrl, loadPromise);
      return loadPromise.then((loadedModel) => {
        const blobURL = URL.createObjectURL(loadedModel.blob);
        return this.loadFromUrl(blobURL, fileType, loadedModel.originalExtension);
      });
    }
  }

  private async loadFromUrl(
    url: string,
    fileType: "model" | "animation",
    extension: string,
  ): Promise<Object3D | AnimationClip | undefined> {
    return new Promise(async (resolve, reject) => {
      const modelLoadResult: ModelLoadResult = await this.modelLoader.load(
        url,
        (loaded: number, total: number) => {
          // no-op
        },
      );
      if (fileType === "model") {
        resolve(modelLoadResult.group as Object3D);
      } else if (fileType === "animation") {
        resolve(modelLoadResult.animations[0] as AnimationClip);
      } else {
        const error = `Trying to load unknown ${fileType} type of element from file ${url}`;
        console.error(error);
        reject(error);
      }
    });
  }
}
