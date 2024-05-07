import { Object3D, Quaternion, Vector3 } from "three";

import { toArray } from "../helpers/math-helpers";

export function encodeCharacterAndCamera(character: Object3D, camera: Object3D): string {
  return [
    ...toArray(character.position),
    ...toArray(character.quaternion),
    ...toArray(camera.position),
    ...toArray(camera.quaternion),
  ].join(",");
}

export function decodeCharacterAndCamera(hash: string): {
  character: { position: Vector3; quaternion: Quaternion };
  camera: { position: Vector3; quaternion: Quaternion };
} {
  const values = hash.split(",").map(Number);
  return {
    character: {
      position: new Vector3(values[0], values[1], values[2]),
      quaternion: new Quaternion(values[3], values[4], values[5], values[6]),
    },
    camera: {
      position: new Vector3(values[7], values[8], values[9]),
      quaternion: new Quaternion(values[10], values[11], values[12], values[13]),
    },
  };
}
