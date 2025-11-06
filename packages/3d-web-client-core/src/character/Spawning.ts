import { Euler, Vector3 } from "three";

import { CharacterManager, SpawnConfigurationState } from "./CharacterManager";
import { decodeCharacterAndCamera } from "./url-position";

function randomWithVariance(value: number, variance: number): number {
  const min = value - variance;
  const max = value + variance;
  return Math.random() * (max - min) + min;
}

export function getSpawnData(
  config: SpawnConfigurationState,
  useLocationHash = false,
): {
  spawnPosition: Vector3;
  spawnRotation: Euler;
  cameraPosition: Vector3;
} {
  const spawnPosition = new Vector3();
  spawnPosition.set(
    randomWithVariance(config.spawnPosition.x, config.spawnPositionVariance.x),
    randomWithVariance(config.spawnPosition.y, config.spawnPositionVariance.y),
    randomWithVariance(config.spawnPosition!.z, config.spawnPositionVariance.z),
  );
  const spawnRotation = new Euler(0, -config.spawnYRotation! * (Math.PI / 180), 0);

  let cameraPosition: Vector3 | null = null;
  const offset = new Vector3(0, 0, 3.3);
  offset.applyEuler(new Euler(0, spawnRotation.y, 0));
  cameraPosition = spawnPosition.clone().sub(offset).add(CharacterManager.headTargetOffset);

  if (useLocationHash && window.location.hash && window.location.hash.length > 1) {
    const urlParams = decodeCharacterAndCamera(window.location.hash.substring(1));
    spawnPosition.copy(urlParams.character.position);
    spawnRotation.setFromQuaternion(urlParams.character.quaternion);
    cameraPosition = new Vector3().copy(urlParams.camera.position);
  }

  return {
    spawnPosition,
    spawnRotation,
    cameraPosition,
  };
}
