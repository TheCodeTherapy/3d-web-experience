import * as React from "react";

import {
  SLOT_BORDER_THICKNESS,
  SLOT_DEPTH,
  SLOT_LABEL_COLOR,
  SLOT_LABEL_TEXT_COLOR,
} from "./constants";

export function DocumentLabel(props: {
  label: string;
  rz: number;
  x: number;
  y?: number;
  z: number;
}) {
  return (
    <m-label
      content={props.label}
      color={SLOT_LABEL_COLOR}
      font-color={SLOT_LABEL_TEXT_COLOR}
      alignment="center"
      width={SLOT_DEPTH}
      height={SLOT_BORDER_THICKNESS}
      rx="-90"
      rz={props.rz}
      z={props.z || 0}
      y={props.y || 0.05}
      x={props.x || 0}
    ></m-label>
  );
}
