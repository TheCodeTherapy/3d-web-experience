import { AmbientLight, Color, DirectionalLight, Group, OrthographicCamera, Vector3 } from "three";

export class Lights extends Group {
  public ambientLight: AmbientLight;
  public frontLight: DirectionalLight;
  public backLight: DirectionalLight;

  constructor() {
    super();

    this.ambientLight = new AmbientLight(0xffffff, 0.5);
    this.add(this.ambientLight);

    const backLightColor = new Color().setRGB(0.85, 1, 1);
    const frontLightColor = new Color().setRGB(1, 0.85, 0.9);

    this.backLight = new DirectionalLight(backLightColor, 3);
    this.add(this.backLight);
    this.frontLight = new DirectionalLight(frontLightColor, 1.5);
    this.add(this.frontLight);

    this.backLight.position.set(4, 4, -10);
    this.frontLight.position.set(-2, 1, 5);

    const frustum = 5;
    const shadowCamera = new OrthographicCamera(-frustum, frustum, frustum, -frustum, 0.01, 20);

    this.frontLight.shadow.normalBias = 0.05;
    this.frontLight.shadow.radius = 2.5;
    this.frontLight.shadow.camera = shadowCamera;
    this.frontLight.shadow.mapSize.set(8192, 8192);
    this.frontLight.castShadow = true;

    this.backLight.shadow.normalBias = 0.05;
    this.backLight.shadow.radius = 2.5;
    this.backLight.shadow.camera = shadowCamera;
    this.backLight.shadow.mapSize.set(8192, 8192);
    this.backLight.castShadow = true;
  }

  dispose() {
    this.ambientLight.dispose();
    this.frontLight.dispose();
    this.backLight.dispose();
  }
}
