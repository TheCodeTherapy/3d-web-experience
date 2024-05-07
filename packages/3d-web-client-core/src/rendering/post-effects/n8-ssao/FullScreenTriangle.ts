// Original code from: https://github.com/N8python/n8ao
// ported to TypeScript

import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  OrthographicCamera,
  ShaderMaterial,
  Sphere,
  WebGLRenderer,
} from "three";

export class FullScreenTriangle {
  private camera: OrthographicCamera = new OrthographicCamera();
  private geometry: BufferGeometry = new BufferGeometry();
  private mesh: Mesh<BufferGeometry, ShaderMaterial>;

  constructor(material: ShaderMaterial) {
    this.geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2),
    );
    this.geometry.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));

    this.geometry.boundingSphere = new Sphere();
    this.geometry.computeBoundingSphere = function () {};

    this.mesh = new Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
  }

  get material(): ShaderMaterial {
    return this.mesh.material as ShaderMaterial;
  }

  set material(value: ShaderMaterial) {
    this.mesh.material = value;
  }

  public render(renderer: WebGLRenderer): void {
    renderer.render(this.mesh, this.camera);
  }

  public dispose(): void {
    this.mesh.material.dispose();
    this.mesh.geometry.dispose();
  }
}
