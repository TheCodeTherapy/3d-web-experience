import { Box3, PerspectiveCamera, Vector3 } from "three";

export function positionCameraToFitBoundingBox(
  camera: PerspectiveCamera,
  boundingBox: Box3,
  size: Vector3,
  padding: number,
  cameraRotation: [number, number, number],
): void {
  const paddingFactor = 1 - -padding / 100;
  let distance: number;

  const objectAspectRatio = size.x / size.y;
  // Determine if the object should fit vertically or horizontally
  const isFitVertically = objectAspectRatio <= camera.aspect;
  if (isFitVertically) {
    distance = (size.y / 2 / Math.tan(((camera.fov / 2) * Math.PI) / 180)) * paddingFactor;
  } else {
    distance =
      (size.x / 2 / Math.tan(((camera.fov / 2) * Math.PI) / 180) / camera.aspect) * paddingFactor;
  }

  const center = new Vector3();
  boundingBox.getCenter(center);

  // Convert spherical coordinates (polar and azimuthal angles) to Cartesian coordinates
  const polarAngle = cameraRotation[1] * (Math.PI / 180); // Convert to radians
  const azimuthalAngle = cameraRotation[2] * (Math.PI / 180); // Convert to radians

  const rotatedPosition = new Vector3();
  rotatedPosition.x = center.x + distance * Math.sin(polarAngle) * Math.cos(azimuthalAngle);
  rotatedPosition.y = center.y + distance * Math.sin(polarAngle) * Math.sin(azimuthalAngle);
  rotatedPosition.z = center.z + distance * Math.cos(polarAngle);

  camera.position.set(rotatedPosition.x, rotatedPosition.y, rotatedPosition.z);
  camera.lookAt(center);
}
