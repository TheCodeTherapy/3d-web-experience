import {
  CircleGeometry,
  DataTexture,
  FrontSide,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  MeshStandardMaterialParameters,
  NearestFilter,
  RGBAFormat,
  RepeatWrapping,
  Texture,
} from "three";

import {
  injectBefore,
  injectBeforeMain,
  injectInsideMain,
} from "../rendering/shaders/shader-helpers";

class CheckerTexture {
  private width: number;
  private height: number;
  private border: number;
  private squareSize: number;
  private squares: number;
  private size: number;
  private data: Uint8Array;
  private normalData: Uint8Array; // Array for normal map data

  private colorValueA: number = 111;
  private colorValueB: number = 210;

  public texture: DataTexture;
  public normalMapTexture: DataTexture; // Normal map texture
  private gapColor = 0; // Black gap color, can be changed as needed

  constructor(
    private repeatX: number,
    private repeatY: number,
    border: number,
    squareSize: number,
    squares: number,
  ) {
    this.border = border;
    this.squareSize = squareSize;
    this.squares = squares;
    this.width = this.height = squares * (squareSize + 1) + 2 * border - 1;
    this.size = this.width * this.height * 4; // RGBA
    this.data = new Uint8Array(this.size);
    this.normalData = new Uint8Array(this.size); // Initialize normal map data array

    this.generateTexture();
    this.texture = new DataTexture(this.data, this.width, this.height, RGBAFormat);
    this.normalMapTexture = new DataTexture(this.normalData, this.width, this.height, RGBAFormat); // Initialize the normal map texture
    this.configureTexture(this.texture);
    this.configureTexture(this.normalMapTexture); // Configure the normal map texture
  }

  private configureTexture(texture: DataTexture) {
    texture.generateMipmaps = true;
    texture.repeat.set(this.repeatX, this.repeatY);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.magFilter = NearestFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.needsUpdate = true;
  }

  private generateTexture() {
    const colors = new Array(this.squares * this.squares);
    for (let sy = 0; sy < this.squares; sy++) {
      for (let sx = 0; sx < this.squares; sx++) {
        colors[sx + sy * this.squares] = Math.floor(
          Math.random() * (this.colorValueB - this.colorValueA + 1) + this.colorValueA,
        );
      }
    }

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = (x + y * this.width) * 4;
        const squareX = Math.floor((x - this.border) / (this.squareSize + 1));
        const squareY = Math.floor((y - this.border) / (this.squareSize + 1));
        const isInSquare =
          (x - this.border) % (this.squareSize + 1) !== this.squareSize &&
          (y - this.border) % (this.squareSize + 1) !== this.squareSize;

        if (
          x >= this.border &&
          y >= this.border &&
          squareX < this.squares &&
          squareY < this.squares
        ) {
          if (!isInSquare) {
            this.fillData(i, this.gapColor, this.gapColor, this.gapColor, 255);
            this.fillDataNormal(i, 128, 128, 32, 255); // Depressed gap appearance
          } else {
            const gray = colors[squareX + squareY * this.squares];
            this.fillData(i, gray, gray, gray, 255);
            this.fillDataNormal(i, 128, 128, 255, 255); // Flat surface for squares
          }
        } else {
          this.fillData(i, this.gapColor, this.gapColor, this.gapColor, 255);
          this.fillDataNormal(i, 128, 128, 255, 255); // Flat surface for borders
        }
      }
    }
  }

  private fillData(offset: number, red: number, green: number, blue: number, alpha: number) {
    this.data[offset + 0] = red;
    this.data[offset + 1] = green;
    this.data[offset + 2] = blue;
    this.data[offset + 3] = alpha;
  }

  private fillDataNormal(offset: number, red: number, green: number, blue: number, alpha: number) {
    this.normalData[offset + 0] = red;
    this.normalData[offset + 1] = green;
    this.normalData[offset + 2] = blue;
    this.normalData[offset + 3] = alpha;
  }
}

class RandomizedTileMaterial extends MeshStandardMaterial {
  constructor(
    private tileRepeatX: number,
    private tileRepeatY: number,
    options?: MeshStandardMaterialParameters,
  ) {
    super(options);

    this.onBeforeCompile = this.onBeforeCompile.bind(this);
  }

  onBeforeCompile(shader: any) {
    const tileX = this.tileRepeatX.toFixed(1);
    const tileY = this.tileRepeatY.toFixed(1);

    shader.vertexShader = "varying vec3 vWorldPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      "vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );\nvWorldPosition = worldPosition.xyz;",
    );
    shader.vertexShader = injectBeforeMain(shader.vertexShader, "varying vec2 vUv;");
    shader.vertexShader = injectInsideMain(shader.vertexShader, "vUv = uv;");

    shader.fragmentShader = injectBeforeMain(
      shader.fragmentShader,
      /* glsl */ `
          varying vec2 vUv;
          varying vec3 vWorldPosition;
          uniform float nearClip;
          uniform float farClip;
          uniform float ditheringNear;
          uniform float ditheringRange;
          uniform float time;
          uniform vec3 diffuseRandomColor;
          uniform int discardAll;

          float cheapHash(vec2 co, float seed) {
            float a = 12.9898;
            float b = 78.233;
            float c = 43758.5453;
            float dt = dot(co.xy ,vec2(a, b));
            float sn = mod(dt, acos(-1.0));
            return fract(sin(sn + seed) * c);
          }

          vec2 rotateUV(vec2 uv, float rotation, vec2 mid) {
            return vec2(
              cos(rotation) * (uv.x - mid.x) + sin(rotation) * (uv.y - mid.y) + mid.x,
              cos(rotation) * (uv.y - mid.y) - sin(rotation) * (uv.x - mid.x) + mid.y
            );
          }
        `,
    );

    shader.fragmentShader = injectBefore(
      shader.fragmentShader,
      "#include <dithering_fragment>",
      /* glsl */ `
      vec2 tileSize = vec2(${tileX}, ${tileY});
      vec2 uv = vUv * tileSize;
      vec2 tile = floor(uv);
      vec2 center = tile + vec2(0.5);
      vec2 randomRotatedTileUV = rotateUV(uv, floor(cheapHash(tile, 2.0) * 400.0) * acos(-1.0), center);
      vec4 rotatedTexture = texture2D(map, randomRotatedTileUV);
      gl_FragColor *= rotatedTexture;`,
    );

    if (this.map) {
      shader.uniforms.map.value = this.map;
    }
  }
}

export class GroundPlane extends Group {
  private readonly floorSize = 210;
  private tileXSize = this.floorSize / 5;
  private tileYSize = this.floorSize / 5;
  private readonly textureFactory = new CheckerTexture(this.tileXSize, this.tileYSize, 2, 30, 8);
  private readonly floorTexture: Texture = this.textureFactory.texture;
  private readonly floorNormalTexture: Texture = this.textureFactory.normalMapTexture;
  private readonly floorGeometry = new CircleGeometry(this.floorSize, this.floorSize);
  private readonly floorMaterial: MeshStandardMaterial;
  private readonly floorMesh: Mesh | null = null;

  constructor() {
    super();

    this.floorMaterial = new RandomizedTileMaterial(this.tileXSize, this.tileYSize, {
      color: 0xffffff,
      side: FrontSide,
      metalness: 0.4,
      roughness: 0.6,
      map: this.floorTexture,
      metalnessMap: this.floorTexture,
      normalMap: this.floorNormalTexture,
    });
    this.floorMesh = new Mesh(this.floorGeometry, this.floorMaterial);
    this.floorMesh.receiveShadow = true;
    this.floorMesh.rotation.x = Math.PI * -0.5;
    this.add(this.floorMesh);
  }
}
