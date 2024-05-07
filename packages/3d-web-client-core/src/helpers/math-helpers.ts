import { Quaternion, Vector3, Vector4 } from "three";

export const roundToDecimalPlaces = (value: number, decimalPlaces: number): number => {
  const mult = 10 ** decimalPlaces;
  return Math.round(value * mult) / mult;
};

export const toArray = (
  origin: Vector3 | Vector4 | Quaternion,
  precision: number = 3,
): number[] => {
  const array = [];
  array[0] = roundToDecimalPlaces(origin.x, precision);
  array[1] = roundToDecimalPlaces(origin.y, precision);
  array[2] = roundToDecimalPlaces(origin.z, precision);
  if (origin instanceof Vector4 || origin instanceof Quaternion) {
    array[3] = roundToDecimalPlaces(origin.w, precision);
  }
  return array;
};

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
