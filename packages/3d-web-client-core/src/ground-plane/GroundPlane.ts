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
  private rotateTiles: boolean = false;

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

    if (this.rotateTiles) {
      this.onBeforeCompile = (shader) => {
        shader.uniforms.map = { value: this.map };

        shader.vertexShader = `
  varying vec2 vUv;
  ${shader.vertexShader}
        `;

        shader.vertexShader = shader.vertexShader.replace(
          "#include <fog_vertex>",
          "#include <fog_vertex>\nvUv = uv;",
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <common>",
          /* glsl */ `
  varying vec2 vUv;
  #include <common>
  float rand(vec2 co, float seed) {
    float a = 12.9898;
    float b = 78.233;
    float c = 43758.5453;
    float dt= dot(co.xy ,vec2(a,b));
    float sn= mod(dt, 3.14);
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

        const fragmentMain = /* glsl */ `
          vec2 uv = vUv;
          vec2 tile = (uv * ${tileRepeat.toFixed(1)});
          vec2 center = tile + vec2(0.5, 0.5);
          vec2 randomRotatedTileUV = rotateUV(uv, rand(tile, 2.0) * 200.0, center);
          vec4 rotatedTexture = texture2D(map, randomRotatedTileUV);
          gl_FragColor *= rotatedTexture;
        `;

        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <dithering_fragment>",
          `
  ${fragmentMain}
  #include <dithering_fragment>
  `,
        );
      };
    }
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

    // Two triangles forming a quad: bottom-left, bottom-right, top-left, top-right
    // Triangle 1: bottom-left -> bottom-right -> top-left
    // Triangle 2: bottom-right -> top-right -> top-left
    const vertices = new Float32Array([
      -halfWidth,
      0.0,
      0.0, // bottom-left
      halfWidth,
      0.0,
      0.0, // bottom-right
      -halfWidth,
      height,
      0.0, // top-left
      halfWidth,
      0.0,
      0.0, // bottom-right
      halfWidth,
      height,
      0.0, // top-right
      -halfWidth,
      height,
      0.0, // top-left
    ]);

    const normals = new Float32Array([
      0,
      0,
      1, // bottom-left
      0,
      0,
      1, // bottom-right
      0,
      0,
      1, // top-left
      0,
      0,
      1, // bottom-right
      0,
      0,
      1, // top-right
      0,
      0,
      1, // top-left
    ]);

    const uvs = new Float32Array([
      0,
      0, // bottom-left
      1,
      0, // bottom-right
      0,
      1, // top-left
      1,
      0, // bottom-right
      1,
      1, // top-right
      0,
      1, // top-left
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

  private simpleNoiseVertexShaderChunk: string;
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

    this.simpleNoiseVertexShaderChunk = /* glsl */ `
float N (vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float smoothNoise (vec2 ip) {
  vec2 lv = fract(ip);
  vec2 id = floor(ip);
  lv = lv * lv * (3.0 - 2.0 * lv);
  float bl = N(id);
  float br = N(id + vec2(1.0, 0.0));
  float b = mix(bl, br, lv.x);
  float tl = N(id + vec2(0.0, 1.0));
  float tr = N(id + vec2(1.0, 1.0));
  float t = mix(tl, tr, lv.x);
  return mix(b, t, lv.y);
}
`;

    this.leafVertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>

varying vec2 vUv;
uniform float time;
uniform float windForce;
uniform float windSpeed;
uniform bool enableBillboarding;

${this.simpleNoiseVertexShaderChunk}

const float ATHIRD = 1.0 / 3.0;
const float THIRDPI = PI * ATHIRD;

void main(void) {
  #include <begin_vertex>
  #include <beginnormal_vertex>
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <defaultnormal_vertex>
  #include <shadowmap_vertex>
  #include <fog_vertex>

  vUv = uv;

  // Compute world position of the instance
  vec4 instancePosition = vec4(0.0, 0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
    instancePosition = instanceMatrix * instancePosition;
  #endif

  vec3 rotatedVertex = position;

  if (enableBillboarding) {
    // Compute the direction vector to the camera on XZ plane
    vec3 toCamera = normalize(vec3(cameraPosition.x, 0.0, cameraPosition.z) - vec3(instancePosition.x, 0.0, instancePosition.z));

    // Compute rotation angle around Y-axis
    float angle = atan(toCamera.x, toCamera.z);

    // Rotate the vertex around its local Y-axis
    mat3 rotationMatrix = mat3(
      cos(angle), 0.0, -sin(angle),
      0.0,        1.0,  0.0,
      sin(angle), 0.0,  cos(angle)
    );

    // Rotate the leaf mesh locally
    rotatedVertex = rotationMatrix * position;
  }

  // Compute final world position
  worldPosition = vec4(rotatedVertex, 1.0);
  #ifdef USE_INSTANCING
    worldPosition = instanceMatrix * worldPosition;
  #endif

  // Apply wind animation after billboard rotation
  float t = time * windSpeed;
  float noise = smoothNoise(worldPosition.xz * 0.5 + vec2(0.0, t));
  noise = pow(noise * 0.5 + 0.5, 2.0) * 2.0;
  float dispPower = windForce - cos(vUv.y * 0.3);
  float displacement = noise * (0.5 * dispPower);
  worldPosition.z += displacement * 0.125;

  // Final transformation to camera space
  vec4 modelViewPosition = modelViewMatrix * worldPosition;
  gl_Position = projectionMatrix * modelViewPosition;
}
`;

    this.leafFragmentShader = /* glsl */ `
varying vec2 vUv;

#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
#include <dithering_pars_fragment>

void main(void) {
  vec3 baseColor = vec3(0.31, 0.9, 0.4);
  float clarity = (vUv.y * 0.5) + 0.0625;
  vec3 finalColor = baseColor * clarity;
  vec3 shadowColor = vec3(0.0, 0.0, 0.0);
  float shadowPower = 0.85;
  gl_FragColor = vec4(mix(finalColor, shadowColor, (1.0 - getShadowMask()) * shadowPower), 1.0);
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

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

      // bias the distribution towards the center with a more gradual curve
      const biasedT = clamps(Math.pow(t, 1.5)); // original - sharp center bias

      // quadratic
      // const biasedT = clamps(t * t); // quadratic - more gradual than pow 1.5

      // inverse sqrt
      // const biasedT = clamps(1 - Math.sqrt(1 - t * t)); // inverse sqrt - gradual center bias

      // sine curve
      // const biasedT = clamps(1 - Math.cos((t * Math.PI) / 2)); // smooth center bias

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

  public grass: Grass | null = null;

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
      this.floorTexture!.repeat.set(this.floorSize / 1.5, this.floorSize / 1.5);
      this.floorMaterial.map = this.floorTexture;
      this.floorMaterial.needsUpdate = true;
    } else if (groundPlaneType === "grass") {
      this.floorSize = 50;
      this.floorGeometry = new CircleGeometry(this.floorSize, 32);
      this.floorMaterial = new TexturedMaterial(20.0, {
        color: new Color(0x77bb99),
      });
      this.floorMesh = new Mesh(this.floorGeometry, this.floorMaterial);
      this.floorMesh.receiveShadow = true;
      this.floorMesh.rotation.x = Math.PI * -0.5;
      this.add(this.floorMesh);

      this.grass = new Grass({
        leavesCount: 1000000,
        radius: this.floorSize,
        leafBaseWidth: 0.021,
        leafHeight: 0.27,
        windForce: 2.06,
        windSpeed: 0.91,
      });
    }
  }

  public update(deltaTime: number) {
    this.grass?.update(deltaTime);
  }
}
