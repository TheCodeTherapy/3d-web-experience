import {
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Group,
  InstancedMesh,
  LinearFilter,
  LinearMipMapLinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Uniform,
  UniformsLib,
  UniformsUtils,
} from "three";

import { leafFragmentShader } from "./shader-chunks/leaf-fragment-shader";
import { leafVertexShader } from "./shader-chunks/leaf-vertex-shader";

// Create a simple 2x2 checkerboard image
const canvas = document.createElement("canvas");
canvas.width = 2;
canvas.height = 2;
const ctx = canvas.getContext("2d")!;
ctx.fillStyle = "#e0e0e0";
ctx.fillRect(0, 0, 2, 2);
ctx.fillStyle = "#606060";
ctx.fillRect(0, 0, 1, 1);
ctx.fillRect(1, 1, 1, 1);

class TexturedMaterial extends MeshStandardMaterial {
  constructor(tileRepeat: number, options = {}) {
    super(options);
    this.initTextures("/assets/textures", tileRepeat);
    this.needsUpdate = true;
  }

  initTextures(path: string, tileRepeat: number) {
    const loader = new TextureLoader();
    this.map = new Texture();

    // Load the color map
    loader.load(`${path}/grass.jpg`, (texture) => {
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.repeat.set(tileRepeat, tileRepeat);
      texture.minFilter = LinearMipmapLinearFilter;
      texture.magFilter = LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 16;
      texture.needsUpdate = true;
      this.map = texture;
      this.needsUpdate = true;
    });

    // Load the normal map
    loader.load(`${path}/grass-normal.jpg`, (normalMap) => {
      normalMap.wrapS = normalMap.wrapT = RepeatWrapping;
      normalMap.repeat.set(tileRepeat, tileRepeat);
      normalMap.minFilter = LinearMipmapLinearFilter;
      normalMap.magFilter = LinearFilter;
      normalMap.needsUpdate = true;
      this.normalMap = normalMap;
      this.needsUpdate = true;
    });
  }
}

type TriangleGeometryOptions = {
  triangleBaseWidth: number;
  triangleHeight: number;
};

class TriangleGeometry extends BufferGeometry {
  constructor(options?: Partial<TriangleGeometryOptions>) {
    super();

    const width = options?.triangleBaseWidth || 0.021;
    const height = options?.triangleHeight || 0.5;

    const vertices = new Float32Array([-width, 0.0, 0.0, width, 0.0, 0.0, 0.0, height, 0.0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1]);
    this.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    this.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    this.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  }
}

type CustomPlaneGeometryOptions = {
  planeWidth: number;
  planeHeight: number;
};

class CustomPlaneGeometry extends BufferGeometry {
  constructor(options?: Partial<CustomPlaneGeometryOptions>) {
    super();

    const width = options?.planeWidth || 0.021;
    const height = options?.planeHeight || 0.5;
    const halfWidth = width / 2;
    const topHalfWidth = halfWidth * 0.5;

    // Two triangles forming a quad: bottom-left, bottom-right, top-left, top-right
    // Triangle 1: bottom-left -> bottom-right -> top-left
    // Triangle 2: bottom-right -> top-right -> top-left

    // prettier-ignore
    const vertices = new Float32Array([
      -halfWidth,    0.0,    0.0, // bottom-left
      +halfWidth,    0.0,    0.0, // bottom-right
      -topHalfWidth, height, 0.0, // top-left
      +halfWidth,    0.0,    0.0, // bottom-right
      +topHalfWidth, height, 0.0, // top-right
      -topHalfWidth, height, 0.0, // top-left
    ]);

    // prettier-ignore
    const normals = new Float32Array([
      0, 0, 1, // bottom-left
      0, 0, 1, // bottom-right
      0, 0, 1, // top-left
      0, 0, 1, // bottom-right
      0, 0, 1, // top-right
      0, 0, 1, // top-left
    ]);

    // prettier-ignore
    const uvs = new Float32Array([
      0, 0, // bottom-left
      1, 0, // bottom-right
      0, 1, // top-left
      1, 0, // bottom-right
      1, 1, // top-right
      0, 1, // top-left
    ]);

    this.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    this.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    this.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  }
}

type GrassOptions = {
  leavesCount: number;
  radius: number;
  leafBaseWidth: number;
  leafHeight: number;
  windForce: number;
  windSpeed: number;
};

class Grass extends Group {
  private leavesCount: number = 500000;
  private radius: number = 50;
  private leafBaseWidth: number = 0.021;
  private leafHeight: number = 0.5;
  private windForce: number = 1.2;
  private windSpeed: number = 0.9;
  private enableBillboarding: boolean = true;

  private dummy = new Object3D();

  private leafVertexShader: string;
  private leafFragmentShader: string;
  private grassLeafMaterial: ShaderMaterial;

  private grassLeafGeometry: TriangleGeometry | CustomPlaneGeometry;
  private instancedGrassMesh: InstancedMesh;

  constructor(options: Partial<GrassOptions>) {
    super();
    this.leavesCount = options.leavesCount || this.leavesCount;
    this.radius = options.radius || this.radius;
    this.leafBaseWidth = options.leafBaseWidth || this.leafBaseWidth;
    this.leafHeight = options.leafHeight || this.leafHeight;
    this.windForce = options.windForce || this.windForce;
    this.windSpeed = options.windSpeed || this.windSpeed;

    this.leafVertexShader = leafVertexShader;
    this.leafFragmentShader = leafFragmentShader;

    // this.grassLeafGeometry = new TriangleGeometry({
    //   triangleBaseWidth: this.leafBaseWidth,
    //   triangleHeight: this.leafHeight,
    // });

    this.grassLeafGeometry = new CustomPlaneGeometry({
      planeWidth: this.leafBaseWidth,
      planeHeight: this.leafHeight,
    });

    this.grassLeafMaterial = new ShaderMaterial({
      vertexShader: this.leafVertexShader,
      fragmentShader: this.leafFragmentShader,
      uniforms: UniformsUtils.merge([
        {
          time: new Uniform(0),
          windForce: new Uniform(this.windForce),
          windSpeed: new Uniform(this.windSpeed),
          enableBillboarding: new Uniform(this.enableBillboarding),
        },
        UniformsLib.lights,
        UniformsLib.fog,
      ]),
      side: DoubleSide,
      fog: true,
      lights: true,
      dithering: true,
    });

    this.instancedGrassMesh = new InstancedMesh(
      this.grassLeafGeometry,
      this.grassLeafMaterial,
      this.leavesCount,
    );
    this.instancedGrassMesh.castShadow = false;
    this.instancedGrassMesh.receiveShadow = true;
    // this.distributeGrassUsingFibonacci(this.radius);
    this.distributeFibonacciUneven2(this.radius);
    this.add(this.instancedGrassMesh);
  }

  private distributeGrassUsingFibonacci(radius: number) {
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const angleIncrement = Math.PI * 2 * goldenRatio;
    const rndOff = 0.21;
    const halfRndOff = rndOff / 2;

    const randomFloatBetween = (min: number, max: number) => Math.random() * (max - min) + min;

    for (let i = 0; i < this.leavesCount; i++) {
      const t = i / this.leavesCount;
      const inc = Math.acos(1 - 2 * t);
      const azimuth = angleIncrement * i;
      const x = radius * Math.sin(inc) * Math.cos(azimuth) + Math.random() * rndOff - halfRndOff;
      const z = radius * Math.sin(inc) * Math.sin(azimuth) + Math.random() * rndOff - halfRndOff;
      const y = 0;

      this.dummy.position.set(x, y, z);
      this.dummy.scale.setScalar(0.4 + Math.random() * 0.59);
      this.dummy.rotation.x = randomFloatBetween(-0.1, 0.1);
      this.dummy.rotation.z = randomFloatBetween(-0.1, 0.1);

      // apply random Y rotation when billboarding is disabled
      if (!this.enableBillboarding) {
        this.dummy.rotation.y = randomFloatBetween(0, Math.PI * 2);
      } else {
        this.dummy.rotation.y = 0;
      }

      this.dummy.updateMatrix();
      this.instancedGrassMesh.setMatrixAt(i, this.dummy.matrix);
    }
  }

  private distributeFibonacciUneven(radius: number) {
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const angleIncrement = Math.PI * 2 * goldenRatio;
    const rndOff = 0.21;
    const halfRndOff = rndOff / 2;

    const randomFloatBetween = (min: number, max: number) => Math.random() * (max - min) + min;

    for (let i = 0; i < this.leavesCount; i++) {
      const t = i / this.leavesCount;

      // bias the distribution towards the center by using a power function
      // this creates higher density in center, linearly decreasing to outer radius
      const biasedT = Math.pow(t, 1.5); // effect power

      const inc = Math.acos(1 - 2 * biasedT);
      const azimuth = angleIncrement * i;

      // radial distance with center bias
      const radialDistance = radius * Math.sin(inc);

      const x = radialDistance * Math.cos(azimuth) + Math.random() * rndOff - halfRndOff;
      const z = radialDistance * Math.sin(azimuth) + Math.random() * rndOff - halfRndOff;
      const y = 0;

      this.dummy.position.set(x, y, z);
      this.dummy.scale.setScalar(0.4 + Math.random() * 0.59);
      this.dummy.rotation.x = randomFloatBetween(-0.1, 0.1);
      this.dummy.rotation.z = randomFloatBetween(-0.1, 0.1);

      // apply random Y rotation when billboarding is disabled
      if (!this.enableBillboarding) {
        this.dummy.rotation.y = randomFloatBetween(0, Math.PI * 2);
      } else {
        this.dummy.rotation.y = 0;
      }

      this.dummy.updateMatrix();
      this.instancedGrassMesh.setMatrixAt(i, this.dummy.matrix);
    }
  }

  private distributeFibonacciUneven2(radius: number) {
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const angleIncrement = Math.PI * 2 * goldenRatio;
    const rndOff = 0.21;
    const halfRndOff = rndOff / 2;

    const randomFloatBetween = (min: number, max: number) => Math.random() * (max - min) + min;

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

    const clamps = (value: number) => clamp(value, 0.000001, 1.0);

    for (let i = 0; i < this.leavesCount; i++) {
      const t = i / this.leavesCount;

      const biasedT = clamps(Math.pow(t, 1.5));

      const inc = Math.acos(1 - 2 * biasedT);
      const azimuth = angleIncrement * i;

      // radial distance with center bias
      const radialDistance = radius * Math.sin(inc);

      const x = radialDistance * Math.cos(azimuth) + Math.random() * rndOff - halfRndOff;
      const z = radialDistance * Math.sin(azimuth) + Math.random() * rndOff - halfRndOff;
      const y = 0;

      this.dummy.position.set(x, y, z);
      this.dummy.scale.setScalar(0.4 + Math.random() * 0.59);
      this.dummy.rotation.x = randomFloatBetween(-0.1, 0.1);
      this.dummy.rotation.z = randomFloatBetween(-0.1, 0.1);

      // apply random Y rotation when billboarding is disabled
      if (!this.enableBillboarding) {
        this.dummy.rotation.y = randomFloatBetween(0, Math.PI * 2);
      } else {
        this.dummy.rotation.y = 0;
      }

      this.dummy.updateMatrix();
      this.instancedGrassMesh.setMatrixAt(i, this.dummy.matrix);
    }
  }

  public update(deltaTime: number) {
    this.grassLeafMaterial.uniforms.time.value += deltaTime;
    this.grassLeafMaterial.uniformsNeedUpdate = true;
  }
}

export class GroundPlane extends Group {
  private floorSize = 210;
  private floorTexture: Texture | null = null;
  private floorGeometry: PlaneGeometry | CircleGeometry;
  private floorMaterial: MeshStandardMaterial;
  private floorMesh: Mesh | null = null;

  private useExtraFloor = false;
  private floorGeometryExtra: CircleGeometry | null = null;
  private floorMaterialExtra: MeshStandardMaterial | null = null;
  private floorMeshExtra: Mesh | null = null;
  private floorTextureExtra: Texture | null = null;

  public grass: Grass | null = null;
  private textureRepeat = 1.5;

  constructor(groundPlaneType?: "neutral" | "grass" | undefined) {
    super();

    if (groundPlaneType === undefined || groundPlaneType === "neutral") {
      this.floorGeometry = new PlaneGeometry(this.floorSize, this.floorSize, 1, 1);
      this.floorMaterial = new MeshStandardMaterial({
        color: 0xffffff,
        side: FrontSide,
        metalness: 0.05,
        roughness: 0.95,
      });
      this.floorMesh = new Mesh(this.floorGeometry, this.floorMaterial);
      this.floorMesh.receiveShadow = true;
      this.floorMesh.rotation.x = Math.PI * -0.5;
      this.add(this.floorMesh);
      this.floorTexture = new CanvasTexture(canvas);
      this.floorTexture!.wrapS = RepeatWrapping;
      this.floorTexture!.wrapT = RepeatWrapping;
      this.floorTexture!.magFilter = NearestFilter;
      this.floorTexture!.minFilter = LinearMipMapLinearFilter;
      this.floorTexture!.repeat.set(
        this.floorSize / this.textureRepeat,
        this.floorSize / this.textureRepeat,
      );
      this.floorMaterial.map = this.floorTexture;
      this.floorMaterial.needsUpdate = true;
    } else if (groundPlaneType === "grass") {
      this.floorSize = 50;
      this.floorGeometry = new CircleGeometry(this.floorSize, 32);
      this.floorMaterial = new TexturedMaterial(20.0, {
        color: new Color(0x66bb88),
      });
      this.floorMesh = new Mesh(this.floorGeometry, this.floorMaterial);
      this.floorMesh.receiveShadow = true;
      this.floorMesh.rotation.x = Math.PI * -0.5;
      this.add(this.floorMesh);

      if (this.useExtraFloor && groundPlaneType === "grass") {
        const extraSizeMultiplier = 10.0;
        this.floorGeometryExtra = new CircleGeometry(this.floorSize * extraSizeMultiplier, 128);
        this.floorMaterialExtra = new MeshStandardMaterial({
          color: 0xffffff,
          side: FrontSide,
          metalness: 0.05,
          roughness: 0.95,
        });
        this.floorMeshExtra = new Mesh(this.floorGeometryExtra, this.floorMaterialExtra);
        this.floorMeshExtra.receiveShadow = true;
        this.floorTextureExtra = new CanvasTexture(canvas);
        this.floorTextureExtra.wrapS = RepeatWrapping;
        this.floorTextureExtra.wrapT = RepeatWrapping;
        this.floorTextureExtra.magFilter = NearestFilter;
        this.floorTextureExtra.minFilter = LinearMipMapLinearFilter;
        this.floorTextureExtra.repeat.set(
          this.floorSize / (this.textureRepeat / extraSizeMultiplier),
          this.floorSize / (this.textureRepeat / extraSizeMultiplier),
        );
        this.floorMaterialExtra.map = this.floorTextureExtra;
        this.floorMaterialExtra.needsUpdate = true;
        this.floorMeshExtra.rotation.x = Math.PI * -0.5;
        this.floorMeshExtra.position.y = -0.01; // slightly below the main floor
        this.add(this.floorMeshExtra);
      }

      this.grass = new Grass({
        leavesCount: 1000000,
        radius: this.floorSize,
        leafBaseWidth: 0.05,
        leafHeight: 0.3,
        windForce: 2.06,
        windSpeed: 0.91,
      });
    }
  }

  public update(deltaTime: number) {
    this.grass?.update(deltaTime);
  }
}
