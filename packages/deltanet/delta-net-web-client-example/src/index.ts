import path from "node:path";
import * as url from "url";

import { DeltaNetServer } from "@mml-io/delta-net-server";
import { watch } from "chokidar";
import express, { static as expressStatic } from "express";
import enableWs from "express-ws";
import ws from "ws";

const dirname = url.fileURLToPath(new URL(".", import.meta.url));
const buildDirectory = path.resolve(dirname, "../../ui");

const port = process.env.PORT || 7971;

const deltaNetServer = new DeltaNetServer({
  serverConnectionIdStateId: 0,
});
console.log("DeltaNetServer created");

const { app } = enableWs(express(), undefined, {
  wsOptions: {
    handleProtocols: DeltaNetServer.handleWebsocketSubprotocol,
  },
});
app.enable("trust proxy");

app.ws("/delta-net-websocket", (ws: ws.WebSocket) => {
  deltaNetServer.addWebSocket(ws as unknown as WebSocket);
  ws.on("close", () => {
    deltaNetServer.removeWebSocket(ws as unknown as WebSocket);
  });
});

setInterval(() => {
  deltaNetServer.tick();
}, 50);

// Create a websocket endpoint that updates whenever the build folder gets modified
const listeningClients = new Set<ws.WebSocket>();
watch(buildDirectory).on("all", () => {
  for (const client of listeningClients) {
    client.send("change");
  }
});
app.ws("/ui-build", (webSocket: ws.WebSocket) => {
  listeningClients.add(webSocket);
  webSocket.on("close", () => {
    listeningClients.delete(webSocket);
  });
});

app.use("/", expressStatic(buildDirectory));

console.log("Serving on port:", port);
console.log(`http://localhost:${port}`);
app.listen(port);
