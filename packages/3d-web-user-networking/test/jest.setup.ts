// Jest setup file for Node.js environment with WebSocket support
import { TextDecoder, TextEncoder } from "util";

import WebSocket from "ws";

// Add TextDecoder and TextEncoder to global scope (needed for buffer operations)
(global as any).TextDecoder = TextDecoder;
(global as any).TextEncoder = TextEncoder;

// Add WebSocket to global scope for Node.js environment
(global as any).WebSocket = WebSocket;
