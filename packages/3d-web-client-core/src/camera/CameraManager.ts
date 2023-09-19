import { PerspectiveCamera, Raycaster, Vector3 } from "three";

import { CollisionsManager } from "../collisions/CollisionsManager";
import { ease, remap, clamp } from "../helpers/math-helpers";
import { getTweakpaneActive } from "../tweakpane/tweakPaneActivity";

export class CameraManager {
  public readonly camera: PerspectiveCamera;

  public initialDistance: number = 3.3;

  private minDistance: number = 0.1;
  private maxDistance: number = 8;

  private initialFOV: number = 60;
  private fov: number = this.initialFOV;
  private minFOV: number = 50;
  private maxFOV: number = 70;
  private targetFOV: number = this.initialFOV;

  private minPolarAngle: number = Math.PI * 0.25;
  private maxPolarAngle: number = Math.PI * 0.95;

  private dampingFactor: number = 0.091;

  public targetDistance: number = this.initialDistance;
  private distance: number = this.initialDistance;
  private desiredDistance: number = this.initialDistance;

  private targetPhi: number | null = Math.PI / 2;
  private phi: number | null = Math.PI / 2;
  private targetTheta: number | null = -Math.PI / 2;
  private theta: number | null = -Math.PI / 2;
  private dragging: boolean = false;

  private target: Vector3 = new Vector3(0, 1.55, 0);

  private hadTarget: boolean = false;

  private rayCaster: Raycaster;

  constructor(private collisionsManager: CollisionsManager) {
    this.camera = new PerspectiveCamera(this.fov, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.position.set(0, 1.4, -this.initialDistance);

    this.rayCaster = new Raycaster();

    document.addEventListener("mousedown", this.onMouseDown.bind(this));
    document.addEventListener("mouseup", this.onMouseUp.bind(this));
    document.addEventListener("mousemove", this.onMouseMove.bind(this));
    document.addEventListener("wheel", this.onMouseWheel.bind(this));
    window.addEventListener("resize", this.onResize.bind(this));
  }

  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private onMouseDown(_event: MouseEvent): void {
    this.dragging = true;
  }

  private onMouseUp(_event: MouseEvent): void {
    this.dragging = false;
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.dragging || getTweakpaneActive() === true) return;
    if (this.targetTheta === null || this.targetPhi === null) return;
    this.targetTheta += event.movementX * 0.01;
    this.targetPhi -= event.movementY * 0.01;
    this.targetPhi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this.targetPhi));
  }

  private onMouseWheel(event: WheelEvent): void {
    const scrollAmount = event.deltaY * 0.001;
    this.targetDistance += scrollAmount;
    this.targetDistance = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this.targetDistance),
    );
    this.desiredDistance = this.targetDistance;
  }

  public setTarget(target: Vector3): void {
    this.target.copy(target);
    if (!this.hadTarget) {
      this.hadTarget = true;
      this.reverseUpdateFromPositions();
    }
  }

  private reverseUpdateFromPositions(): void {
    if (this.phi === null || this.theta == null) return;
    const dx = this.camera.position.x - this.target.x;
    const dy = this.camera.position.y - this.target.y;
    const dz = this.camera.position.z - this.target.z;
    this.targetDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.targetTheta = (this.theta + 2 * Math.PI) % (2 * Math.PI);
    this.targetPhi = Math.max(0, Math.min(Math.PI, this.phi));
    this.phi = this.targetPhi;
    this.theta = this.targetTheta;
    this.distance = this.targetDistance;
  }

  public adjustCameraPosition(): void {
    this.rayCaster.set(
      this.camera.position,
      this.target.clone().sub(this.camera.position).normalize(),
    );
    const minimumDistance = this.collisionsManager.raycastFirstDistance(this.rayCaster.ray);
    const cameraToPlayerDistance = this.camera.position.distanceTo(this.target);

    if (minimumDistance !== null && minimumDistance <= cameraToPlayerDistance) {
      this.targetDistance = cameraToPlayerDistance - minimumDistance;
      this.distance = this.targetDistance;
    } else {
      this.targetDistance += (this.desiredDistance - this.targetDistance) * this.dampingFactor * 4;
    }
  }

  public update(): void {
    if (this.target === null) return;
    if (
      this.phi !== null &&
      this.targetPhi !== null &&
      this.theta !== null &&
      this.targetTheta !== null
    ) {
      this.distance += (this.targetDistance - this.distance) * this.dampingFactor * 0.21;
      this.phi += (this.targetPhi - this.phi) * this.dampingFactor;
      this.theta += (this.targetTheta - this.theta) * this.dampingFactor;

      const x = this.target.x + this.distance * Math.sin(this.phi) * Math.cos(this.theta);
      const y = this.target.y + this.distance * Math.cos(this.phi);
      const z = this.target.z + this.distance * Math.sin(this.phi) * Math.sin(this.theta);

      this.targetFOV = remap(
        this.targetDistance,
        this.minDistance,
        this.maxDistance,
        this.minFOV,
        this.maxFOV,
      );

      this.fov += ease(this.targetFOV, this.fov, 0.07);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();

      this.camera.position.set(x, clamp(y, 0.1, Infinity), z);

      this.adjustCameraPosition();

      this.camera.lookAt(this.target);
    }
  }
}
