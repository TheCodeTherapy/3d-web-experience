import { Vector3 } from "three";

export const getSpawnPositionInsideCircle = (
  radius: number,
  positions: number,
  id: number,
  yPos: number = 0,
): Vector3 => {
  if (id > 0) id += 3;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const theta = id * goldenAngle;
  const scale = id / positions;
  const scaledRadius = scale * radius;
  const x = Math.cos(theta) * scaledRadius;
  const z = Math.sin(theta) * scaledRadius;
  return new Vector3(x, yPos, z);
};

export const round = (n: number, digits: number): number => {
  return Number(n.toFixed(digits));
};

export const ease = (target: number, n: number, factor: number): number => {
  return round((target - n) * factor, 5);
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const remap = (
  value: number,
  minValue: number,
  maxValue: number,
  minScaledValue: number,
  maxScaledValue: number,
): number => {
  return (
    minScaledValue +
    ((maxScaledValue - minScaledValue) * (value - minValue)) / (maxValue - minValue)
  );
};
