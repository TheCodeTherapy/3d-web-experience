# Architecture Simplification Summary

## Overview

Successfully consolidated the React MML document functionality from the separate `rect-mml-server`
into the main `multi-user-3d-web-experience/server`. This simplifies the architecture by providing a
single server that can handle both static HTML MML documents and React MML documents.

## Changes Made

### 1. **Unified Server Architecture**

- **Before**: Required separate servers for HTML and React MML documents
- **After**: Single server handles both document types

### 2. **Enhanced ReactMMLDocumentServer**

- **Before**: Handled only single React document
- **After**: Supports multiple React documents from a directory
- **New Features**:
  - Document routing by name (`/mml-document/{documentName}`)
  - Dynamic document loading
  - API endpoint to list available documents (`/api/react-mml-documents`)

### 3. **Integrated Build Process**

- **Before**: Separate build processes for server and React documents
- **After**: Unified build process where `npm run build` builds both
- **New Scripts**:
  - `npm run build:react-mml` - Build React documents only
  - `npm run iterate:react-mml` - Watch React documents for changes

### 4. **Directory Structure**

```
example/multi-user-3d-web-experience/server/
├── src/                           # Server source code
├── mml-documents/                 # Static HTML MML documents
├── react-mml-documents/           # React MML documents
│   ├── src/                       # React components
│   ├── build/                     # Built JavaScript files
│   ├── build.ts                   # Build configuration
│   └── package.json              # Dependencies
└── build/                         # Built server
```

### 5. **Dependencies Added**

- React and React DOM for JSX support
- RAPIER physics engine for physics simulations
- MML React types for TypeScript support
- ESBuild with WASM plugin for bundling

## Benefits

1. **Simplified Development**: Single server to run and manage
2. **Unified Asset Serving**: All assets served from one place
3. **Consistent Routing**: Both document types follow similar URL patterns
4. **Easier Deployment**: Single deployment target
5. **Better Resource Management**: Shared dependencies and infrastructure

## Usage

### Starting the Server

```bash
cd example/multi-user-3d-web-experience/server
npm install
npm run build
npm start
```

### Development Mode

```bash
# Terminal 1: Watch React documents (from server directory)
npm run iterate:react-mml

# Terminal 2: Watch and run server (from server directory)
npm run iterate
```

### Document Access

- **Static HTML MML**: `http://localhost:8080/mml-documents/playground.html`
- **React MML**: WebSocket connection to `ws://localhost:8080/mml-document/simple-demo`
- **Available React documents**: `http://localhost:8080/api/react-mml-documents`

## Backward Compatibility

The server maintains backward compatibility:

- Existing HTML MML documents continue to work unchanged
- Default React document endpoint `/mml-document` still works
- All existing WebSocket protocols remain intact

## Migration Path

To migrate from the old architecture:

1. Move React document source files to `react-mml-documents/src/`
2. Update build configuration in `react-mml-documents/build.ts`
3. Use the unified server instead of separate servers
4. Update client connections to use the new WebSocket endpoints

## Future Enhancements

This architecture enables:

- Easy addition of new React MML documents
- Shared components and utilities between documents
- Centralized configuration and dependencies
- Consistent development and deployment workflows
