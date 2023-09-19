import * as React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { INTERACTIVE_SLOT_COUNT_X, INTERACTIVE_SLOT_COUNT_Z } from "./constants";
import { Slot } from "./Slot";

const DEMO_SLOTS = [
  {
    documentUrl: `${(window as any).params.wsProtocol}:///mml-documents/magicstairs.html`,
    title: "Magic Stairs",
  },
  {
    documentUrl: `${(window as any).params.wsProtocol}:///mml-documents/gliders.html`,
    title: "The Gliders",
  },
  {
    documentUrl: `${(window as any).params.wsProtocol}:///mml-documents/weather.html`,
    title: "Weather API",
  },
  {
    documentUrl: `${(window as any).params.wsProtocol}:///mml-documents/positionprobe.html`,
    title: "<m-position-probe>",
  },
  {
    documentUrl: `${(window as any).params.wsProtocol}:///mml-documents/videoplayer.html`,
    title: "Video Player",
  },
  {
    documentUrl: `${(window as any).params.wsProtocol}:///mml-documents/dice.html`,
    title: "The Dice",
  },
  {
    documentUrl: `${(window as any).params.wsProtocol}:///mml-documents/duck.html`,
    title: "The Duck",
  },
  {
    documentUrl: `${(window as any).params.wsProtocol}:///mml-documents/html.html`,
    title: "HTML to <m-image>",
  },
  {
    documentUrl: `${(window as any).params.wsProtocol}:///mml-documents/colorstairs.html`,
    title: "Color Stairs",
  },
  {
    documentUrl: `${(window as any).params.wsProtocol}:///mml-documents/glassbridge.html`,
    title: "Glass Bridge",
  },
  {
    documentUrl: `/assets/static-mml.html`,
    title: "Static MML",
  },
];

function getPositionOnCircle(
  length: number,
  radius: number,
  index: number,
  mirrored: boolean = false,
): { px: number; pz: number; ry: number } {
  const angleStep = (2 * Math.PI) / length;
  const theta = angleStep * index;
  const px = radius * Math.cos(theta);
  const pz = radius * Math.sin(theta);
  let ry = (theta * 180) / -Math.PI;
  ry = mirrored === true ? (ry + 180) % 360 : ry;
  return { px, pz, ry };
}

function App() {
  const slotCoordinates: Array<[number, number]> = [];
  for (let x = 0; x < INTERACTIVE_SLOT_COUNT_X; x++) {
    for (let z = 0; z < INTERACTIVE_SLOT_COUNT_Z; z++) {
      slotCoordinates.push([x, z]);
    }
  }
  return (
    <>
      {DEMO_SLOTS.map((slot, index) => {
        const { px, pz, ry } = getPositionOnCircle(
          DEMO_SLOTS.length,
          DEMO_SLOTS.length * 5,
          index,
          true,
        );
        return (
          <Slot
            key={"demo-" + index}
            x={px}
            z={pz}
            ry={ry}
            demo={{ url: slot.documentUrl, title: slot.title }}
          />
        );
      })}
      {slotCoordinates.map(([,], index) => {
        const { px, pz, ry } = getPositionOnCircle(slotCoordinates.length, 120, index);
        return <Slot key={index} x={px} z={pz} ry={ry} />;
      })}
      <Slot
        key={"office"}
        x={0}
        z={0}
        y={-0.1}
        ry={0}
        clean
        demo={{
          url: `${(window as any).params.wsProtocol}:///mml-documents/office.html`,
          title: "Office",
        }}
      />
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const container = document.getElementById("root")!;
const root = createRoot(container);
flushSync(() => {
  root.render(<App />);
});
