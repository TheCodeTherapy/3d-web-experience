import { MCubeElement } from "@mml-io/mml-react-types";
import * as React from "react";

import { usePlayersContext } from "./players-context";

type CubeProps = {
  x?: number;
  y?: number;
  z?: number;
  color?: string;
  lerpDuration?: number;
  trackPlayers?: boolean;
  trackRadius?: number;
};

export default function MMLCube({
  x = 0,
  y = 0.5,
  z = 0,
  color = "hsl(0, 100%, 50%)",
  lerpDuration = 200,
  trackPlayers = false,
  trackRadius = 15,
}: CubeProps) {
  const cubeRef = React.useRef<MCubeElement>(null);
  const [rotation, setRotation] = React.useState({ rx: 0, ry: 0, rz: 0 });

  const { findClosestPlayer } = usePlayersContext();

  React.useEffect(() => {
    if (!trackPlayers) return;

    const cubePosition = { x, y, z };
    const closestPlayer = findClosestPlayer(cubePosition);

    if (closestPlayer) {
      const dx = closestPlayer.x - cubePosition.x;
      const dz = closestPlayer.z - cubePosition.z;
      const yRotation = Math.atan2(dx, dz) * (180 / Math.PI);

      const dist = Math.sqrt(dx * dx + dz * dz);
      setRotation({ rx: 0, ry: yRotation, rz: 0 });
    } else {
      setRotation({ rx: 0, ry: 0, rz: 0 });
    }
  }, [trackPlayers, x, y, z, findClosestPlayer, trackRadius]);

  return (
    <m-group x={x} y={y} z={z}>
      <m-cube color={color} ref={cubeRef} rx={rotation.rx} ry={rotation.ry} rz={rotation.rz}>
        <m-attr-lerp attr="all" duration={lerpDuration} easing="easeInOutQuad" />
        <m-plane color="white" z={0.51} />
      </m-cube>
    </m-group>
  );
}
