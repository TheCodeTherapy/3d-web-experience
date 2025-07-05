import {
  MMLPositionEnterEvent,
  MMLPositionLeaveEvent,
  MMLPositionMoveEvent,
  MPositionProbeElement,
} from "@mml-io/mml-react-types";
import * as React from "react";

import { usePlayersContext } from "./players-context";

type MMLProbeProps = {
  range?: number;
  interval?: number;
  debug?: boolean;
  x?: number;
  y?: number;
  z?: number;
};

export default function MMLProbe({
  range = 15,
  interval = 100,
  debug = true,
  x = 0,
  y = 0,
  z = 0,
}: MMLProbeProps) {
  const positionProbeRef = React.useRef<MPositionProbeElement>(null);
  const { updatePlayerTransform, deletePlayerTransform } = usePlayersContext();
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    const handlePositionEnter = (event: MMLPositionEnterEvent) => {
      if (!mountedRef.current) return;
      try {
        const { position, rotation } = event.detail.elementRelative;
        const { connectionId } = event.detail;
        updatePlayerTransform(connectionId, position, rotation);
      } catch (error) {
        console.warn("Position enter event error:", error);
      }
    };

    const handlePositionMove = (event: MMLPositionMoveEvent) => {
      if (!mountedRef.current) return;
      try {
        const { position, rotation } = event.detail.elementRelative;
        const { connectionId } = event.detail;
        updatePlayerTransform(connectionId, position, rotation);
      } catch (error) {
        console.warn("Position move event error:", error);
      }
    };

    const handlePositionLeave = (event: MMLPositionLeaveEvent) => {
      if (!mountedRef.current) return;
      try {
        deletePlayerTransform(event.detail.connectionId);
      } catch (error) {
        console.warn("Position leave event error:", error);
      }
    };

    const positionProbe = positionProbeRef.current;

    if (positionProbe) {
      positionProbe.addEventListener("positionenter", handlePositionEnter);
      positionProbe.addEventListener("positionmove", handlePositionMove);
      positionProbe.addEventListener("positionleave", handlePositionLeave);
    }

    return () => {
      if (positionProbe) {
        positionProbe.removeEventListener("positionenter", handlePositionEnter);
        positionProbe.removeEventListener("positionmove", handlePositionMove);
        positionProbe.removeEventListener("positionleave", handlePositionLeave);
      }
    };
  }, [updatePlayerTransform, deletePlayerTransform]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return (
    <m-position-probe
      id="main-position-probe"
      ref={positionProbeRef}
      range={range}
      interval={interval}
      debug={debug ? "true" : "false"}
      x={x}
      y={y}
      z={z}
    />
  );
}
