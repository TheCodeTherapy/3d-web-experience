import { PositionAndRotation } from "@mml-io/mml-web";
import { Euler, Matrix4, Object3D, Quaternion, Vector3 } from "three";

const tempContainerMatrix = new Matrix4();
const tempTargetMatrix = new Matrix4();
const tempPositionVector = new Vector3();
const tempRotationEuler = new Euler();
const tempRotationQuaternion = new Quaternion();
const tempScaleVector = new Vector3();

export function getRelativePositionAndRotationRelativeToObject(
  positionAndRotation: PositionAndRotation,
  container: Object3D,
): PositionAndRotation {
  const { x, y, z } = positionAndRotation.position;
  const { x: rx, y: ry, z: rz } = positionAndRotation.rotation;

  container.updateWorldMatrix(true, false);
  tempContainerMatrix.copy(container.matrixWorld).invert();

  tempPositionVector.set(x, y, z);
  tempRotationEuler.set(rx, ry, rz);
  tempRotationQuaternion.setFromEuler(tempRotationEuler);
  tempScaleVector.set(1, 1, 1);

  tempTargetMatrix.compose(tempPositionVector, tempRotationQuaternion, tempScaleVector);
  tempTargetMatrix.premultiply(tempContainerMatrix);
  tempTargetMatrix.decompose(tempPositionVector, tempRotationQuaternion, tempScaleVector);

  tempRotationEuler.setFromQuaternion(tempRotationQuaternion);

  // Correct for the container's local scale
  tempPositionVector.multiply(container.scale);

  return {
    position: {
      x: tempPositionVector.x,
      y: tempPositionVector.y,
      z: tempPositionVector.z,
    },
    rotation: {
      x: tempRotationEuler.x,
      y: tempRotationEuler.y,
      z: tempRotationEuler.z,
    },
  };
}
