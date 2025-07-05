import { MGroupAttributes, MGroupElement } from "@mml-io/mml-react-types";
import * as React from "react";

export type Position = {
  x?: string | number;
  y?: string | number;
  z?: string | number;
};

export type Scale = {
  sx?: string | number;
  sy?: string | number;
  sz?: string | number;
};

export type Rotation = {
  rx?: string | number;
  ry?: string | number;
  rz?: string | number;
};

export type GroupProps = MGroupAttributes & {
  forwardRef?: React.Ref<MGroupElement>;
};
