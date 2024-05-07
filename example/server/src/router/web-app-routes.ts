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
const webAvatarBuildDir = path.join(dirname, "../../web-avatar-client/build/");

export function addWebAppRoutes(
  app: enableWs.Application,
  options: {
    generateAuthorizedSessionToken(req: express.Request): string | null;
  },
) {
  // Serve frontend statically in production
  const demoIndexContent = fs.readFileSync(path.join(webClientBuildDir, "index.html"), "utf8");
  app.get("/", (req, res) => {
    if (process.env.DISABLE_SERVER === "true") {
      res.send(FORK_PAGE_CONTENT);
      return;
    }

    const token = options.generateAuthorizedSessionToken(req);
    if (!token) {
      res.send("Error: Could not generate token");
      return;
    }

    const authorizedDemoIndexContent = demoIndexContent.replace("SESSION.TOKEN.PLACEHOLDER", token);
    res.send(authorizedDemoIndexContent);
  });

  app.use("/web-client/", express.static(webClientBuildDir));
  app.use("/web-avatar-client/", express.static(webAvatarBuildDir));

  if (process.env.NODE_ENV !== "production") {
    const listeningClients = new Set<WebSocket>();
    const avatarListeningClients = new Set<WebSocket>();

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

    chokidar.watch(webAvatarBuildDir).on("all", () => {
      for (const client of avatarListeningClients) {
        client.send("change");
      }
    });

    // Create an event-source that updates whenever the build folder gets modified
    app.ws("/web-avatar-build", (ws: WebSocket) => {
      const headers = {
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
        "Cache-Control": "no-cache",
      };
      avatarListeningClients.add(ws);

      ws.on("close", () => {
        avatarListeningClients.delete(ws);
      });
    });
  }
}
