import { PerspectiveCamera, Raycaster, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { CollisionsManager } from "../collisions/CollisionsManager";
import { remap } from "../helpers/math-helpers";
import { EventHandlerCollection } from "../input/EventHandlerCollection";
import { camValues } from "../tweakpane/blades/cameraFolder";
import { TweakPane } from "../tweakpane/TweakPane";
import { getTweakpaneActive } from "../tweakpane/tweakPaneActivity";

const cameraPanSensitivity = 20;
const scrollZoomSensitivity = 0.1;
const pinchZoomSensitivity = 0.025;

export class CameraManager {
  public readonly camera: PerspectiveCamera;
  private flyCamera: PerspectiveCamera;
  private orbitControls: OrbitControls;
  private isMainCameraActive: boolean = true;

  public initialDistance: number = camValues.initialDistance;
  public minDistance: number = camValues.minDistance;
  public maxDistance: number = camValues.maxDistance;
  public damping: number = camValues.damping;
  public zoomScale: number = camValues.zoomScale;
  public zoomDamping: number = camValues.zoomDamping;

  public initialFOV: number = camValues.initialFOV;
  public maxFOV: number = camValues.maxFOV;
  public minFOV: number = camValues.minFOV;
  public invertFOVMapping: boolean = camValues.invertFOVMapping;
  public fov: number = this.initialFOV;
  private targetFOV: number = this.initialFOV;

  public defaultMinPolarAngle: number = Math.PI * 0.05;
  public defaultFirstPersonPolarAngle: number = Math.PI * 0.25;
  public minPolarAngle: number = this.defaultMinPolarAngle;
  private maxPolarAngle: number = Math.PI * 0.98;

  public distance: number = this.initialDistance;
  public targetDistance: number = this.initialDistance;
  public desiredDistance: number = this.initialDistance;

  private phi: number;
  private targetPhi: number;
  private theta: number;
  private targetTheta: number;

  private target: Vector3 = new Vector3(0, 1.55, 0);
  private hadTarget: boolean = false;

  private rayCaster: Raycaster;
  private eventHandlerCollection: EventHandlerCollection;

  private finalTarget: Vector3 = new Vector3();
  private isLerping: boolean = false;
  private lerpTarget: Vector3 = new Vector3();
  private lerpFactor: number = 0;
  private lerpDuration: number = 2.1;

  private activePointers = new Map<number, { x: number; y: number }>();

  constructor(
    private targetElement: HTMLElement,
    private collisionsManager: CollisionsManager,
    initialPhi = Math.PI / 2,
    initialTheta = -Math.PI / 2,
  ) {
    this.targetElement.style.touchAction = "pinch-zoom";
    this.phi = initialPhi;
    this.targetPhi = this.phi;
    this.theta = initialTheta;
    this.targetTheta = this.theta;

    const aspect = window.innerWidth / window.innerHeight;

    this.camera = new PerspectiveCamera(this.fov, aspect, 0.1, 400);
    this.camera.position.set(0, 1.4, -this.initialDistance);
    this.camera.name = "MainCamera";
    this.flyCamera = new PerspectiveCamera(this.initialFOV, aspect, 0.1, 400);
    this.flyCamera.name = "FlyCamera";
    this.flyCamera.position.copy(this.camera.position);
    this.flyCamera.name = "FlyCamera";

    this.orbitControls = new OrbitControls(this.flyCamera, this.targetElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.enablePan = true;
    this.orbitControls.enabled = false;

    this.rayCaster = new Raycaster();

    this.createEventHandlers();
  }

  private createEventHandlers(): void {
    this.eventHandlerCollection = EventHandlerCollection.create([
      [this.targetElement, "pointerdown", this.onPointerDown.bind(this)],
      [this.targetElement, "gesturestart", this.preventDefaultAndStopPropagation.bind(this)],
      [this.targetElement, "wheel", this.onMouseWheel.bind(this)],
      [this.targetElement, "contextmenu", this.onContextMenu.bind(this)],
      [document, "pointerup", this.onPointerUp.bind(this)],
      [document, "pointercancel", this.onPointerUp.bind(this)],
      [document, "pointermove", this.onPointerMove.bind(this)],
    ]);
  }

  private disposeEventHandlers(): void {
    this.eventHandlerCollection.clear();
  }

  private preventDefaultAndStopPropagation(evt: PointerEvent): void {
    evt.preventDefault();
    evt.stopPropagation();
  }

  public setupTweakPane(tweakPane: TweakPane) {
    tweakPane.setupCamPane(this);
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.isMainCameraActive && (event.button === 0 || event.button === 2)) {
      const pointerInfo = { x: event.clientX, y: event.clientY };
      this.activePointers.set(event.pointerId, pointerInfo);
      document.body.style.cursor = "none";
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (this.isMainCameraActive) {
      const existingPointer = this.activePointers.get(event.pointerId);
      if (existingPointer) {
        this.activePointers.delete(event.pointerId);
        if (this.activePointers.size === 0) {
          document.body.style.cursor = "default";
        }
      }
    }
  }

  private getAveragePointerPositionAndSpread(): { pos: { x: number; y: number }; spread: number } {
    const existingSum = { x: 0, y: 0 };
    this.activePointers.forEach((p) => {
      existingSum.x += p.x;
      existingSum.y += p.y;
    });
    const aX = existingSum.x / this.activePointers.size;
    const aY = existingSum.y / this.activePointers.size;

    let sumOfDistances = 0;
    this.activePointers.forEach((p) => {
      const distance = Math.sqrt((p.x - aX) ** 2 + (p.y - aY) ** 2);
      sumOfDistances += distance;
    });
    return { pos: { x: aX, y: aY }, spread: sumOfDistances / this.activePointers.size };
  }

  private onPointerMove(event: PointerEvent): void {
    if (getTweakpaneActive() || !this.isMainCameraActive) {
      return;
    }

    const existingPointer = this.activePointers.get(event.pointerId);
    if (existingPointer) {
      const previous = this.getAveragePointerPositionAndSpread();

      existingPointer.x = event.clientX;
      existingPointer.y = event.clientY;

      const latest = this.getAveragePointerPositionAndSpread();

      const sX = latest.pos.x - previous.pos.x;
      const sY = latest.pos.y - previous.pos.y;

      const dx = (sX / this.targetElement.clientWidth) * cameraPanSensitivity;
      const dy = (sY / this.targetElement.clientHeight) * cameraPanSensitivity;

      if (this.activePointers.size > 1) {
        const zoomDelta = latest.spread - previous.spread;
        this.zoom(-zoomDelta * pinchZoomSensitivity);
      }

      this.targetTheta += dx;
      this.targetPhi -= dy;
      this.targetPhi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this.targetPhi));
      event.preventDefault();
    }
  }

  private onMouseWheel(event: WheelEvent): void {
    if (getTweakpaneActive() || !this.isMainCameraActive) {
      return;
    }
    event.preventDefault();
    const scrollAmount = event.deltaY * this.zoomScale * scrollZoomSensitivity;
    this.zoom(scrollAmount);
  }

  private zoom(delta: number) {
    this.targetDistance += delta;
    this.targetDistance = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this.targetDistance),
    );
    this.desiredDistance = this.targetDistance;
  }

  private onContextMenu(event: PointerEvent): void {
    if (this.isMainCameraActive) {
      event.preventDefault();
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key.toLowerCase() === "f10") {
      this.isMainCameraActive = !this.isMainCameraActive;

      if (this.orbitControls) {
        this.orbitControls.enabled = !this.isMainCameraActive;
      }

      if (!this.isMainCameraActive) {
        this.flyCamera.position.copy(this.camera.position);
        this.flyCamera.rotation.copy(this.camera.rotation);

        // Determine the target the main camera is looking at
        const target = new Vector3();
        this.camera.getWorldDirection(target);
        target.multiplyScalar(this.targetDistance).add(this.camera.position);

        // Update orbit controls to use this target as the pivot point
        this.orbitControls?.target.copy(target);
        this.orbitControls?.update();
        this.eventHandlerCollection.clear();
      } else {
        this.eventHandlerCollection = EventHandlerCollection.create([
          [this.targetElement, "pointerdown", this.onPointerDown.bind(this)],
          [this.targetElement, "gesturestart", this.preventDefaultAndStopPropagation.bind(this)],
          [document, "pointerup", this.onPointerUp.bind(this)],
          [document, "pointercancel", this.onPointerUp.bind(this)],
          [document, "pointermove", this.onPointerMove.bind(this)],
          [this.targetElement, "wheel", this.onMouseWheel.bind(this)],
          [this.targetElement, "contextmenu", this.onContextMenu.bind(this)],
        ]);
      }
    }
  }

  public setTarget(target: Vector3): void {
    if (!this.isLerping) {
      this.target.copy(target);
    } else {
      this.finalTarget.copy(target);
      this.lerpTarget.copy(this.target);
      this.lerpFactor = 0;
    }

    if (!this.hadTarget) {
      this.hadTarget = true;
      this.reverseUpdateFromPositions();
    }
  }

  public setLerpedTarget(target: Vector3, targetDistance: number): void {
    this.isLerping = true;
    this.targetDistance = targetDistance;
    this.desiredDistance = targetDistance;
    this.setTarget(target);
  }

  public reverseUpdateFromPositions(): void {
    const dx = this.camera.position.x - this.target.x;
    const dy = this.camera.position.y - this.target.y;
    const dz = this.camera.position.z - this.target.z;
    this.targetDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.distance = this.targetDistance;
    this.desiredDistance = this.targetDistance;
    this.theta = Math.atan2(dz, dx);
    this.targetTheta = this.theta;
    this.phi = Math.acos(dy / this.targetDistance);
    this.targetPhi = this.phi;
    this.recomputeFoV(true);
  }

  public adjustCameraPosition(): void {
    const offsetDistance = 0.5;
    const offset = new Vector3(0, 0, offsetDistance);
    offset.applyEuler(this.camera.rotation);
    const rayOrigin = this.camera.position.clone().add(offset);
    const rayDirection = rayOrigin.sub(this.target.clone()).normalize();

    this.rayCaster.set(this.target.clone(), rayDirection);
    const firstRaycastHit = this.collisionsManager.raycastFirst(this.rayCaster.ray);

    if (firstRaycastHit !== null && firstRaycastHit[0] <= this.desiredDistance) {
      const distanceToCollision = firstRaycastHit[0] - 0.1;
      this.targetDistance = distanceToCollision;
      this.distance = distanceToCollision;
    } else {
      this.targetDistance = this.desiredDistance;
    }
  }

  public updateAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.flyCamera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.flyCamera.updateProjectionMatrix();
  }

  public dispose() {
    this.disposeEventHandlers();
    this.orbitControls.dispose();
    document.body.style.cursor = "";
  }

  private easeOutExpo(x: number): number {
    return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
  }

  public recomputeFoV(immediately: boolean = false): void {
    this.targetFOV = remap(
      this.targetDistance,
      this.minDistance,
      this.maxDistance,
      this.invertFOVMapping ? this.minFOV : this.maxFOV,
      this.invertFOVMapping ? this.maxFOV : this.minFOV,
    );
    if (immediately) {
      this.fov = this.targetFOV;
    }
  }

  public toggleFlyCamera(): void {
    this.isMainCameraActive = !this.isMainCameraActive;
    this.orbitControls.enabled = !this.isMainCameraActive;

    if (!this.isMainCameraActive) {
      this.updateAspect(window.innerWidth / window.innerHeight);
      this.flyCamera.position.copy(this.camera.position);
      this.flyCamera.rotation.copy(this.camera.rotation);
      const target = new Vector3();
      this.camera.getWorldDirection(target);
      target.multiplyScalar(this.targetDistance).add(this.camera.position);
      this.orbitControls.target.copy(target);
      this.orbitControls.update();
      this.disposeEventHandlers();
    } else {
      this.createEventHandlers();
    }
  }

  get activeCamera(): PerspectiveCamera {
    return this.isMainCameraActive ? this.camera : this.flyCamera;
  }

  public update(): void {
    if (!this.isMainCameraActive) {
      this.orbitControls.update();
      return;
    }
    if (this.isLerping && this.lerpFactor < 1) {
      this.lerpFactor += 0.01 / this.lerpDuration;
      this.lerpFactor = Math.min(1, this.lerpFactor);
      this.target.lerpVectors(this.lerpTarget, this.finalTarget, this.easeOutExpo(this.lerpFactor));
    } else {
      this.adjustCameraPosition();
    }

    this.distance += (this.targetDistance - this.distance) * this.zoomDamping;
    this.theta += (this.targetTheta - this.theta) * this.damping;
    this.phi += (this.targetPhi - this.phi) * this.damping;

    const x = this.target.x + this.distance * Math.sin(this.phi) * Math.cos(this.theta);
    const y = this.target.y + this.distance * Math.cos(this.phi);
    const z = this.target.z + this.distance * Math.sin(this.phi) * Math.sin(this.theta);

    this.recomputeFoV();
    this.fov += (this.targetFOV - this.fov) * this.zoomDamping;
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);

    if (this.isLerping && this.lerpFactor >= 1) {
      this.isLerping = false;
    }
  }

  public getActiveCamera(): PerspectiveCamera {
    return this.isMainCameraActive ? this.camera : this.flyCamera;
  }

  public hasActiveInput(): boolean {
    return this.activePointers.size > 0;
  }
}
