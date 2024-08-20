import { TimeManager, CameraManager, CollisionsManager } from "@mml-io/3d-web-client-core";
import { ModelLoader, ModelLoadResult } from "@mml-io/model-loader";
import {
  AnimationClip,
  AnimationMixer,
  Bone,
  LinearSRGBColorSpace,
  LoadingManager,
  LoopRepeat,
  Object3D,
  PMREMGenerator,
  Scene,
  VSMShadowMap,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

import { Lights } from "./scene/Lights";
import { Mirror } from "./scene/Mirror";

export class AvatarRenderer {
  private readonly camOffset: Vector3 = new Vector3(0, 1.2, 0);

  private width: number = 1;
  private height: number = 1;

  private canvasDiv: HTMLDivElement | null = null;
  private cameraManager: CameraManager | null = null;

  private timeManager: TimeManager = new TimeManager();
  private modelLoader: ModelLoader = new ModelLoader();

  public renderer: WebGLRenderer | null = null;
  public scene: Scene;

  private mixer: AnimationMixer | null = null;
  private animationAsset: ModelLoadResult | null | undefined = null;

  private lights: Lights;
  private mirror: Mirror | null = null;

  public cameraTargetOffset: { x?: number; y?: number; z?: number } = {};
  public cameraTargetDistance: number = 0;

  private cleanupNonRotationAnimTracks: boolean = true;

  constructor(
    private hdrURL: string,
    private idleAnimationURL: string,
    private showMirror: boolean,
  ) {
    this.scene = new Scene();
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.shadowMap.type = VSMShadowMap;
    this.renderer.shadowMap.enabled = true;
    this.renderer.setSize(this.width, this.height);

    // Lights
    this.lights = new Lights(this.camOffset);
    this.scene.add(this.lights);

    // Mirror
    if (this.showMirror) {
      this.mirror = new Mirror();
      this.scene.add(this.mirror.mesh);
    }

    if (this.hdrURL) {
      this.useHDRI(this.hdrURL);
    }

    // Events
    this.update = this.update.bind(this);
    this.updateProjection = this.updateProjection.bind(this);
    window.addEventListener("resize", this.updateProjection);
    this.updateProjection();
  }

  public updateProjection(): void {
    if (!this.renderer) return;
    const parentElement = this.renderer.domElement.parentNode as HTMLElement;
    if (!parentElement) {
      return;
    }
    this.width = parentElement.clientWidth;
    this.height = parentElement.clientHeight;
    const aspect = this.width / this.height;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.width, this.height);
    if (this.cameraManager) {
      this.cameraManager.camera.aspect = aspect;
      this.cameraManager.camera.updateProjectionMatrix();
    }
  }

  public useHDRI(url: string): void {
    if (!this.renderer) return;
    const pmremGenerator = new PMREMGenerator(this.renderer);
    new RGBELoader(new LoadingManager()).load(
      url,
      (texture) => {
        const envMap = pmremGenerator!.fromEquirectangular(texture).texture;
        if (envMap) {
          envMap.colorSpace = LinearSRGBColorSpace;
          envMap.needsUpdate = true;
          this.scene.environment = envMap;
          texture.dispose();
          pmremGenerator!.dispose();
        }
      },
      () => {},
      (error: ErrorEvent) => {
        console.error(`Can't load ${url}: ${JSON.stringify(error)}`);
      },
    );
  }

  public setDistanceAndOffset(
    cameraTargetOffset: { x?: number; y?: number; z?: number },
    cameraTargetDistance: number,
  ) {
    if (!this.cameraManager) return;
    this.cameraTargetOffset = cameraTargetOffset;
    this.cameraTargetDistance = cameraTargetDistance;
    this.cameraManager.setLerpedTarget(
      new Vector3(this.cameraTargetOffset.x, this.cameraTargetOffset.y, this.cameraTargetOffset.z),
      this.cameraTargetDistance,
    );
  }

  private cleanAnimationClips(skeletalMesh: Object3D, animationClip: AnimationClip): AnimationClip {
    const availableBones = new Set<string>();
    skeletalMesh.traverse((child) => {
      const asBone = child as Bone;
      if (asBone.isBone) {
        availableBones.add(child.name);
      }
    });
    animationClip.tracks = animationClip.tracks.filter((track) => {
      const [trackName, trackProperty] = track.name.split(".");
      const shouldAnimate =
        availableBones.has(trackName) && trackProperty !== "position" && trackProperty !== "scale";
      return shouldAnimate;
    });
    return animationClip;
  }

  public async animateCharacter(model: Object3D) {
    this.mixer = new AnimationMixer(model);
    if (this.animationAsset === null) {
      this.animationAsset = await this.modelLoader.load(this.idleAnimationURL);
    }
    if (this.animationAsset && this.animationAsset.animations) {
      const animationClip = this.cleanupNonRotationAnimTracks
        ? this.cleanAnimationClips(this.animationAsset.group, this.animationAsset.animations[0])
        : this.animationAsset.animations[0];

      const animationAction = this.mixer.clipAction(animationClip);
      animationAction.setLoop(LoopRepeat, Infinity);
      animationAction.play();
    }
  }

  public update(): void {
    if (!this.scene || !this.renderer) return;
    this.timeManager.update();
    if (!this.canvasDiv) {
      const canvasDiv = document.getElementById("avatar-canvas-container");
      if (canvasDiv !== null) {
        this.canvasDiv = canvasDiv as HTMLDivElement;
        new ResizeObserver(this.updateProjection).observe(
          this.renderer.domElement.parentNode as Element,
        );
        this.updateProjection();
      }
    }
    if (this.cameraManager === null && this.canvasDiv) {
      this.cameraManager = new CameraManager(
        this.canvasDiv,
        new CollisionsManager(this.scene),
        Math.PI / 2.3,
        Math.PI / 2,
      );
    }
    if (this.cameraManager?.camera) {
      this.cameraManager.update();
      this.renderer.render(this.scene, this.cameraManager.camera);
    }
    if (this.mixer) {
      this.mixer.setTime(this.timeManager.time);
      this.mixer.update(this.timeManager.smoothDeltaTime);
    }
  }

  public dispose(): void {
    //
  }
}
