import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

export default function SimpleDemoDocument() {
  return (
    <m-group id="simple-demo" x={0} y={0} z={0}>
      <m-cube x={0} y={1} z={0} color="red" width={1} height={1} depth={1} />
      <m-cube x={2} y={1} z={0} color="blue" width={1} height={1} depth={1} />
      <m-cube x={-2} y={1} z={0} color="green" width={1} height={1} depth={1} />
      <m-label
        x={0}
        y={3}
        z={0}
        content="Hello from React MML Document!"
        color="white"
        font-size={20}
      />
    </m-group>
  );
}

// Auto-mount when this document is loaded
(() => {
  const container = document.getElementById("root");
  if (container) {
    const root = createRoot(container);
    flushSync(() => {
      root.render(<SimpleDemoDocument />);
    });
  }
})();
