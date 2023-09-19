import fs from "fs";
import path from "path";
import * as url from "url";

import chokidar from "chokidar";
import express from "express";
import enableWs from "express-ws";
import WebSocket from "ws";
const dirname = url.fileURLToPath(new URL(".", import.meta.url));

const FORK_PAGE_CONTENT = `
  Please click the 'Fork' button to create your sandbox.
`;

const webClientBuildDir = path.join(dirname, "../../web-client/build/");
export function addWebAppRoutes(app: enableWs.Application) {
  // Serve frontend statically in production
  const demoIndexContent = fs.readFileSync(path.join(webClientBuildDir, "index.html"), "utf8");
  app.get("/", (req, res) => {
    if (process.env.DISABLE_SERVER === "true") {
      res.send(FORK_PAGE_CONTENT);
      return;
    }
    res.send(demoIndexContent);
  });
  app.use("/web-client/", express.static(webClientBuildDir));

  if (process.env.NODE_ENV !== "production") {
    const listeningClients = new Set<WebSocket>();

    chokidar.watch(webClientBuildDir).on("all", () => {
      for (const client of listeningClients) {
        client.send("change");
      }
    });

    // Create an event-source that updates whenever the build folder gets modified
    app.ws("/web-client-build", (ws: WebSocket) => {
      const headers = {
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
        "Cache-Control": "no-cache",
      };
      listeningClients.add(ws);

      ws.on("close", () => {
        listeningClients.delete(ws);
      });
    });
  }
}
