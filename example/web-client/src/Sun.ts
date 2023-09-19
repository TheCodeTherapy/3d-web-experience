import { CameraHelper, DirectionalLight, Group, OrthographicCamera, Vector3 } from "three";

export class Sun extends Group {
  private readonly debug: boolean = false;
  private readonly sunOffset: Vector3 = new Vector3(50, 80, 35);
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

    this.updateCharacterPosition(new Vector3(0, 0, 0));

    this.add(this.directionalLight);
    if (this.debug === true && this.camHelper instanceof CameraHelper) {
      this.add(this.camHelper);
    }
  }

  public updateCharacterPosition(position: Vector3 | undefined) {
    if (!position) return;
    const newSunPosition = position.clone().add(this.sunOffset);
    this.directionalLight.position.set(newSunPosition.x, newSunPosition.y, newSunPosition.z);
    this.directionalLight.target.position.copy(position.clone());
    this.directionalLight.target.updateMatrixWorld();
  }
}
