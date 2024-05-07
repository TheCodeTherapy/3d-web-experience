import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";

export class Mirror {
  private mirrorGeometry = new BoxGeometry(3, 2, 0.02);
  public mesh: Group = new Group();

  private mirrorMesh: Reflector = new Reflector(this.mirrorGeometry, {
    clipBias: 1e-10,
    color: new Color(0xaaaaaa),
    textureWidth: window.innerWidth * window.devicePixelRatio,
    textureHeight: window.innerHeight * window.devicePixelRatio,
  });

  private mirrorFrameGeometry: BoxGeometry = new BoxGeometry(3.05, 2.05, 0.01);
  private mirrorFrameMaterial: MeshStandardMaterial = new MeshStandardMaterial({
    color: 0x000000,
    metalness: 0.5,
    roughness: 0.3,
  });
  private mirrorFrame: Mesh = new Mesh(this.mirrorFrameGeometry, this.mirrorFrameMaterial);

  constructor() {
    this.mirrorMesh.castShadow = true;
    this.mirrorMesh.receiveShadow = true;
    this.mirrorMesh.position.set(1.575, 1.025, -1.575);
    this.mirrorMesh.rotation.y = Math.PI * 1.25;
    this.mirrorMesh.rotation.x = Math.PI;

    this.mirrorFrame.castShadow = true;
    this.mirrorFrame.receiveShadow = true;
    this.mirrorFrame.position.set(1.58, 1.025, -1.58);
    this.mirrorFrame.rotation.y = Math.PI * 1.25;
    this.mirrorFrame.rotation.x = Math.PI;

    this.mesh.add(this.mirrorFrame);
    this.mesh.add(this.mirrorMesh);
  }
}
