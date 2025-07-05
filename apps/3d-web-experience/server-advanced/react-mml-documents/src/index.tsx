import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import * as RAPIER from "../vendor/RAPIER";

import MMLDocument from "./mml-document";
import { PhysicsProvider } from "./physics-context";

function App({ rapier }: { rapier: any }) {
  return (
    <PhysicsProvider rapier={rapier}>
      <MMLDocument />
    </PhysicsProvider>
  );
}

(async () => {
  try {
    await RAPIER.init();
    const rapier = RAPIER;
    console.log("RAPIER initialized successfully!");

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const container = document.getElementById("root")!;
    const root = createRoot(container);
    flushSync(() => {
      root.render(<App rapier={rapier} />);
    });
  } catch (error) {
    console.error("Failed to initialize RAPIER:", error);
  }
})();
