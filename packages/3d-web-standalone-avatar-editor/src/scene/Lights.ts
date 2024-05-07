import { AmbientLight, DirectionalLight, Group, OrthographicCamera, Vector3 } from "three";

export class Lights extends Group {
  public ambientLight: AmbientLight;
  public frontLight: DirectionalLight;
  public backLight: DirectionalLight;

  private shadowResolution: number = 8192;
  private shadowCamFrustum: number = 10;
  private lookAtTarget: Vector3;

  private shadowCamera = new OrthographicCamera(
    -this.shadowCamFrustum,
    this.shadowCamFrustum,
    this.shadowCamFrustum,
    -this.shadowCamFrustum,
    0.1,
    200,
  );

  constructor(private cameraOffset: Vector3) {
    super();
    this.lookAtTarget = new Vector3().copy(new Vector3()).add(this.cameraOffset);

    this.ambientLight = new AmbientLight(0xffffff, 0.4);
    this.add(this.ambientLight);

    this.frontLight = new DirectionalLight(0xffeedd, 1.0);
    this.frontLight.position.set(2, 4, 2);
    this.frontLight.shadow.normalBias = 0.05;
    this.frontLight.shadow.radius = 1.5;
    this.frontLight.shadow.camera = this.shadowCamera;
    this.frontLight.shadow.mapSize.set(this.shadowResolution, this.shadowResolution);
    this.frontLight.castShadow = true;
    this.frontLight.target.position.copy(this.lookAtTarget);
    this.add(this.frontLight);

    this.backLight = new DirectionalLight(0xddffff, 2.0);
    this.backLight.position.set(2, 4, -3);
    this.backLight.shadow.normalBias = 0.05;
    this.backLight.shadow.radius = 1.5;
    this.backLight.shadow.camera = this.shadowCamera;
    this.backLight.shadow.mapSize.set(this.shadowResolution, this.shadowResolution);
    this.backLight.castShadow = true;
    this.backLight.target.position.copy(this.lookAtTarget);
    this.add(this.backLight);

    this.frontLight.target.updateMatrixWorld();
    this.backLight.target.updateMatrixWorld();
  }
}
