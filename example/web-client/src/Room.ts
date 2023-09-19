import {
  CircleGeometry,
  FrontSide,
  Group,
  LinearMipMapLinearFilter,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  RepeatWrapping,
  Texture,
  TextureLoader,
} from "three";

export class Room extends Group {
  private readonly floorSize = 210;
  private readonly floorTexture: Texture | null = null;
  private readonly floorGeometry = new CircleGeometry(this.floorSize, this.floorSize);
  private readonly floorMaterial: MeshStandardMaterial;
  private readonly floorMesh: Mesh | null = null;

  constructor() {
    super();

    this.floorMaterial = new MeshStandardMaterial({
      color: 0xbcbcbc,
      side: FrontSide,
      metalness: 0.04,
      roughness: 0.49,
    });
    this.floorMesh = new Mesh(this.floorGeometry, this.floorMaterial);
    this.floorMesh.receiveShadow = true;
    this.floorMesh.rotation.x = Math.PI * -0.5;
    this.add(this.floorMesh);

    this.floorTexture = new TextureLoader(new LoadingManager()).load(
      "/web-client/assets/textures/checker.png",
      () => {
        this.floorTexture!.wrapS = RepeatWrapping;
        this.floorTexture!.wrapT = RepeatWrapping;
        this.floorTexture!.magFilter = NearestFilter;
        this.floorTexture!.minFilter = LinearMipMapLinearFilter;
        this.floorTexture!.repeat.set(this.floorSize / 1.5, this.floorSize / 1.5);
        this.floorMaterial.map = this.floorTexture;
        this.floorMaterial.needsUpdate = true;
      },
    );
  }
}
