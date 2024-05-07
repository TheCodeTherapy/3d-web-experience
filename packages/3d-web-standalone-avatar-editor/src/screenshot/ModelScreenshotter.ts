import { ModelLoader } from "@mml-io/model-loader";
import {
  AnimationMixer,
  Box3,
  LinearSRGBColorSpace,
  LoadingManager,
  Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Vector3,
  VSMShadowMap,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

import { getDataUrlFromRenderTarget } from "./getDataUrlFromRenderTarget";
import { Lights } from "./Lights";
import { positionCameraToFitBoundingBox } from "./positionCameraToFitBoundingBox";

export class ModelScreenshotter {
  private readonly modelLoader = new ModelLoader();
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly lights: Lights;

  constructor(private hdrURL?: string) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.shadowMap.type = VSMShadowMap;
    this.renderer.shadowMap.enabled = true;
    this.scene = new Scene();
    this.lights = new Lights();
    this.scene.add(this.lights);
  }

  private renderObjectToRenderTarget(
    model: Object3D,
    width: number,
    height: number,
    padding: number,
    ssaa: number,
  ): WebGLRenderTarget {
    // Create a new WebGLRenderTarget
    const renderTarget = new WebGLRenderTarget(width * ssaa, height * ssaa);
    model.updateMatrixWorld();

    // Compute the bounding box of the object
    const boundingBox = new Box3().setFromObject(model);
    const size = new Vector3();
    boundingBox.getSize(size);

    const camera = new PerspectiveCamera(50, width / height, 0.1, 1000);
    positionCameraToFitBoundingBox(camera, boundingBox, size, padding, [0, 15, 30]);

    this.scene.add(model);

    this.renderer.setRenderTarget(renderTarget);
    this.renderer.render(this.scene, camera);

    this.scene.remove(model);

    return renderTarget;
  }

  public async screenshot(
    model: Object3D | string,
    animationURL: string,
    animationTime: number,
    width: number,
    height: number,
    padding: number,
    ssaa: number,
  ): Promise<string> {
    let loadedModel;
    if (model instanceof Object3D) {
      loadedModel = model;
    } else {
      const modelLoadResult = await this.modelLoader.load(model);
      loadedModel = modelLoadResult.group;
    }
    const mixer = new AnimationMixer(loadedModel);

    if (this.hdrURL) {
      await new Promise<void>((resolve, reject) => {
        new RGBELoader(new LoadingManager()).load(
          this.hdrURL!,
          (texture) => {
            const pmremGenerator = new PMREMGenerator(this.renderer);
            const envMap = pmremGenerator.fromEquirectangular(texture).texture;
            envMap.colorSpace = LinearSRGBColorSpace;
            envMap.needsUpdate = true;
            this.scene.environment = envMap;
            texture.dispose();
            pmremGenerator.dispose();
            resolve();
          },
          undefined,
          (err) => {
            console.error(`Error loading HDR: ${err}`);
            reject(err);
          },
        );
      });
    }

    const modelLoadResult = await this.modelLoader.load(animationURL);
    if (modelLoadResult && modelLoadResult.animations) {
      const animationClip = modelLoadResult.animations[0];
      const animationAction = mixer.clipAction(animationClip);
      animationAction.play();
      mixer.setTime(animationTime);
      mixer.update(0);
    }

    const renderTarget = this.renderObjectToRenderTarget(loadedModel, width, height, padding, ssaa);
    const dataUrl = getDataUrlFromRenderTarget(renderTarget, this.renderer, width, height, ssaa);
    renderTarget.dispose();
    return dataUrl;
  }

  public dispose() {
    this.renderer.dispose();
    this.lights.dispose();
  }
}
