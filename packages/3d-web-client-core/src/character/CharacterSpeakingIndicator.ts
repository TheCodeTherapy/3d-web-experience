import {
  Camera,
  CircleGeometry,
  GLSL3,
  Mesh,
  Object3D,
  RawShaderMaterial,
  Scene,
  Vector3,
} from "three";

import { ease } from "../helpers/math-helpers";

export class CharacterSpeakingIndicator {
  private vertexShader = /* glsl */ `
  in vec3 position;
  in vec2 uv;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

  private fragmentShader = /* glsl */ `
  precision highp float;

  uniform float time;
  uniform float alpha;
  in vec2 vUv;
  out vec4 fragColor;

  const float size = 1.7;
  const float distribution = 0.03;
  const float speed = 0.2;
  const float overdraw = 3.5;
  const float shapeK = 0.25;

  float sdHyperbola(vec2 p, float k, float wi) {
    p = abs(p);
    float k2 = k * k;
    float a = p.x + p.y;
    float i = 0.5 * (a - k2 / a) > wi ? -1.0 : 1.0;
    float x = clamp(0.5 * (a - k2 / a), 0.0, wi);
    vec2 q = vec2(x, sqrt(x * x + k2));
    float s = sign(p.x * p.x - p.y * p.y + k2);
    return s * length(p - q);
  }

  void main(void) {
    vec2 uv = (vUv * 2.0 - 1.0);
    float r = -(uv.x * uv.x + uv.y * uv.y);
    float z = 0.5 + 0.5 * sin((r + time * speed) / distribution);
    float a = clamp(smoothstep(-0.1, 0.2, size - length(uv * 2.0)), 0.0, 0.5);
    float h = clamp(sdHyperbola(uv, shapeK, 1.0), 0.0, 1.0) * overdraw;
    float fragAlpha = clamp(a * h, 0.0, 0.7);
    fragColor = vec4(z * fragAlpha) * alpha;
  }`;

  private uniforms = {
    time: { value: 0.0 },
    alpha: { value: 0.0 },
  };

  private geometry: CircleGeometry = new CircleGeometry(0.35, 21);
  private material: RawShaderMaterial = new RawShaderMaterial({
    vertexShader: this.vertexShader,
    fragmentShader: this.fragmentShader,
    uniforms: this.uniforms,
    transparent: true,
    glslVersion: GLSL3,
  });
  private mesh = new Mesh(this.geometry, this.material);

  private currentAlpha = 0.0;
  private targetAlpha = 0.0;

  constructor(private scene: Scene | Object3D) {
    this.scene.add(this.mesh);
  }

  public setBillboarding(position: Vector3, camera: Camera) {
    this.mesh.position.set(position.x, position.y - 0.15, position.z);
    this.mesh.lookAt(camera.position);
  }

  public setTime(value: number) {
    this.currentAlpha += ease(this.targetAlpha, this.currentAlpha, 0.06);
    this.uniforms.time.value = value;
    this.uniforms.alpha.value = this.currentAlpha;
  }

  public setSpeaking(value: boolean) {
    this.targetAlpha = value === true ? 1.0 : 0.0;
  }

  public dispose() {
    this.scene.remove(this.mesh);
    this.mesh.material.dispose();
    this.mesh.geometry.dispose();
  }
}
