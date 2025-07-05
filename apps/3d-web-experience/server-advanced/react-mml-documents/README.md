# React MML Documents

This directory contains React-based MML documents that can be served alongside static HTML MML
documents.

## Architecture

The server now supports both:

- **Static HTML MML documents** from `mml-documents/` folder
- **React MML documents** from `react-mml-documents/` folder

## Creating React MML Documents

1. **Create a new React component** in `src/` folder (e.g., `my-document.tsx`)
2. **Add the entry point** to `build.ts` in the `entryPoints` configuration
3. **Build the document** using `npm run build:react-mml`

### Example React MML Document

```tsx
import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

export default function MyDocument() {
  return (
    <m-group id="my-document" x={0} y={0} z={0}>
      <m-cube x={0} y={1} z={0} color="red" width={1} height={1} depth={1} />
      <m-label x={0} y={3} z={0} content="Hello from React!" color="white" font-size={20} />
    </m-group>
  );
}

// Auto-mount when this document is loaded
(() => {
  const container = document.getElementById("root");
  if (container) {
    const root = createRoot(container);
    flushSync(() => {
      root.render(<MyDocument />);
    });
  }
})();
```

## WebSocket Endpoints

- **Default document**: `/mml-document` (serves `index` document)
- **Named document**: `/mml-document/{documentName}` (serves specific document)
- **API endpoint**: `/api/react-mml-documents` (lists available documents)

## Build Process

- **Build React documents**: `npm run build:react-mml` (runs from server directory)
- **Build server**: `npm run build` (includes React documents)
- **Watch React documents**: `npm run iterate:react-mml` (runs from server directory)

Note: The build scripts automatically change to the `react-mml-documents` directory to build the
React components.

## Development

The server watches for changes in the `build/` directory and automatically reloads connected clients
when React documents are rebuilt.

## Available Documents

- `index` - Main React MML document with physics simulation
- `simple-demo` - Simple demonstration with colored cubes

## Usage in Client

Connect to React MML documents using the WebSocket endpoints:

```javascript
const ws = new WebSocket("ws://localhost:8080/mml-document/simple-demo");
```
