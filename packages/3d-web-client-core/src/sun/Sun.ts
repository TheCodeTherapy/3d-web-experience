import { CameraHelper, Color, DirectionalLight, Group, OrthographicCamera, Vector3 } from "three";

import { sunValues } from "../tweakpane/blades/environmentFolder";

export class Sun extends Group {
  private readonly debug: boolean = false;
  private readonly sunOffset: Vector3 = new Vector3(
    39 * (Math.PI / 180),
    50 * (Math.PI / 180),
    100,
  );
  private readonly shadowResolution: number = 8192;
  private readonly shadowCamFrustum: number = 50;
  private readonly camHelper: CameraHelper | null = null;

  private readonly shadowCamera: OrthographicCamera;
  private readonly directionalLight: DirectionalLight;

  public target: Vector3 | null = null;

  constructor() {
    super();
    this.shadowCamera = new OrthographicCamera(
      -this.shadowCamFrustum,
      this.shadowCamFrustum,
      this.shadowCamFrustum,
      -this.shadowCamFrustum,
      0.1,
      200,
    );
    if (this.debug === true) {
      this.camHelper = new CameraHelper(this.shadowCamera);
    }
    this.directionalLight = new DirectionalLight(0xffffff, 0.5);
    this.directionalLight.shadow.normalBias = 0.05;
    this.directionalLight.shadow.radius = 1.5;
    this.directionalLight.shadow.camera = this.shadowCamera;
    this.directionalLight.shadow.mapSize.set(this.shadowResolution, this.shadowResolution);
    this.directionalLight.castShadow = true;
    this.setColor();

    this.updateCharacterPosition(new Vector3(0, 0, 0));

    this.add(this.directionalLight);
    if (this.debug === true && this.camHelper instanceof CameraHelper) {
      this.add(this.camHelper);
    }
  }

  public updateCharacterPosition(position: Vector3 | undefined) {
    if (!position) return;
    this.target = position;
    this.setSunPosition(this.sunOffset.x, this.sunOffset.y);
  }

  public setAzimuthalAngle(angle: number) {
    if (this.sunOffset) this.sunOffset.x = angle;
    if (this.target) this.updateCharacterPosition(this.target);
  }

  public setPolarAngle(angle: number) {
    if (this.sunOffset) this.sunOffset.y = angle;
    if (this.target) this.updateCharacterPosition(this.target);
  }

  public setIntensity(intensity: number) {
    this.directionalLight.intensity = intensity;
  }

  public setColor() {
    this.directionalLight.color = new Color().setRGB(
      sunValues.sunColor.r,
      sunValues.sunColor.g,
      sunValues.sunColor.b,
    );
  }

  private setSunPosition(azimuthalAngle: number, polarAngle: number) {
    if (!this.target) return;
    const distance = this.sunOffset.z;
    const sphericalPosition = new Vector3(
      distance * Math.sin(polarAngle) * Math.cos(azimuthalAngle),
      distance * Math.cos(polarAngle),
      distance * Math.sin(polarAngle) * Math.sin(azimuthalAngle),
    );
    const newSunPosition = this.target.clone().add(sphericalPosition);
    this.directionalLight.position.set(newSunPosition.x, newSunPosition.y, newSunPosition.z);
    this.directionalLight.target.position.copy(this.target.clone());
    this.directionalLight.target.updateMatrixWorld();
  }
}
