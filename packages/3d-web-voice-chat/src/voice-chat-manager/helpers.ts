import { type Position, type Euler, type Rotation, type Quaternion } from "./VoiceChatManager";

function copySign(x: number, y: number) {
  return Math.abs(x) * (y >= 0 ? 1 : -1);
}

function radToDeg(r: number) {
  return r * (180 / Math.PI);
}

function formatNumber(n: number) {
  let formatted = n.toFixed(2);
  if (n >= 0) formatted = `+${formatted}`;
  return formatted;
}

export function formatPos(position: Position): string {
  const x = formatNumber(position.x);
  const y = formatNumber(position.y);
  const z = formatNumber(position.z);
  return `x: ${x}, y: ${y}, z: ${z}`;
}

export function formatDirection(direction: Euler): string {
  const pitch = formatNumber(direction.pitch);
  const yaw = formatNumber(direction.yaw);
  const roll = formatNumber(direction.roll);
  return `pitch: ${pitch}, yaw: ${yaw}, roll: ${roll}`;
}

export function getEulerFromQuaternion(rotation: Rotation): Euler {
  // constructing a full quaternion here in case we ever implement
  // full rotation (pitch-yaw-roll) for characters
  const quaternion: Quaternion = {
    x: 0,
    y: rotation.quaternionY,
    z: 0,
    w: rotation.quaternionW,
  };

  // pitch (x-axis rot)
  const sinRollCosPitch = 2 * (quaternion.w * quaternion.x + quaternion.y * quaternion.z);
  const cosRollCosPitch = 1 - 2 * (quaternion.x * quaternion.x + quaternion.y * quaternion.y);
  const pitch = Math.atan2(sinRollCosPitch, cosRollCosPitch);

  // yaw (y-axis rot)
  const sinPitch = 2 * (quaternion.w * quaternion.y - quaternion.z * quaternion.x);
  const yaw = Math.abs(sinPitch) >= 1 ? copySign(Math.PI / 2, sinPitch) : Math.asin(sinPitch);

  // roll (z-axis rot)
  const sinYawcosPitch = 2 * (quaternion.w * quaternion.z + quaternion.x * quaternion.y);
  const cosYawCosPitch = 1 - 2 * (quaternion.y * quaternion.y + quaternion.z * quaternion.z);
  const roll = Math.atan2(sinYawcosPitch, cosYawCosPitch);

  return {
    pitch: radToDeg(pitch),
    yaw: radToDeg(yaw),
    roll: radToDeg(roll),
  };
}
