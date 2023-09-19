import path from "path";
import url from "url";

import dolbyio from "@dolbyio/dolbyio-rest-apis-client";
import JwtToken from "@dolbyio/dolbyio-rest-apis-client/dist/types/jwtToken";
import { ChatNetworkingServer } from "@mml-io/3d-web-text-chat";
import { UserNetworkingServer } from "@mml-io/3d-web-user-networking";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import enableWs from "express-ws";
import WebSocket from "ws";

import { authMiddleware } from "./auth";
import { MMLDocumentsServer } from "./router/MMLDocumentsServer";
import { ReactMMLDocumentServer } from "./router/ReactMMLDocumentServer";
import { addWebAppRoutes } from "./router/web-app-routes";

dotenv.config();
const dirname = url.fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 8080;
const documentsWatchPath = path.resolve(path.join(dirname, "../mml-documents"), "*.html");
const MML_DOCUMENT_PATH = path.join(dirname, "../../playground/build/index.js");

const { app } = enableWs(express());
app.enable("trust proxy");

const DOLBY_APP_KEY = process.env.DOLBY_APP_KEY ?? "";
const DOLBY_APP_SECRET = process.env.DOLBY_APP_SECRET ?? "";
let apiTokenPromise: Promise<JwtToken>;

const fetchApiToken = (): Promise<JwtToken> => {
  if (DOLBY_APP_KEY && DOLBY_APP_SECRET) {
    const apiAccessToken = dolbyio.authentication.getApiAccessToken(
      DOLBY_APP_KEY,
      DOLBY_APP_SECRET,
      600,
      ["comms:client_access_token:create"],
    );
    return apiAccessToken;
  }
  throw new Error("Audio service not configured");
};

const fetchAccessToken = (apiToken: JwtToken, id: string) => {
  const accessToken = dolbyio.communications.authentication.getClientAccessTokenV2({
    accessToken: apiToken,
    externalId: id,
    sessionScope: ["conf:create", "notifications:set"],
  });
  return accessToken;
};

if (DOLBY_APP_KEY && DOLBY_APP_SECRET) {
  apiTokenPromise = fetchApiToken();
}

if (process.env.PASS) {
  app.use("/voice-token/:id", authMiddleware(process.env.PASS));
}

app.get("/voice-token/:id", async (req, res) => {
  try {
    if (!apiTokenPromise) {
      res.status(501).json({ error: "Audio service not configured" });
      return;
    }

    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }

    let apiToken = await apiTokenPromise;

    try {
      const accessToken = await fetchAccessToken(apiToken, id);
      res.json({ accessToken: accessToken.access_token });
    } catch (err) {
      if (typeof err === "string" && err.includes("Expired or invalid token")) {
        try {
          console.log("Token is invalid or expired. Fetching a new one");
          apiTokenPromise = fetchApiToken();
          apiToken = await apiTokenPromise;
          const accessToken = await fetchAccessToken(apiToken, id);
          res.json({ accessToken: accessToken.access_token });
        } catch (error) {
          console.error(`Error re-fetching for a valid token: ${error}`);
        }
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error(`error: ${err}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

const mmlDocumentsServer = new MMLDocumentsServer(documentsWatchPath);
const reactMMLDocumentServer = new ReactMMLDocumentServer(MML_DOCUMENT_PATH);

// Handle playground document sockets
app.ws("/playground", (ws) => {
  reactMMLDocumentServer.handle(ws);
});

// Handle example document sockets
app.ws(`/mml-documents/:filename`, (ws: WebSocket, req: express.Request) => {
  const { filename } = req.params;
  mmlDocumentsServer.handle(filename, ws);
});

// Serve assets with CORS allowing all origins
app.use("/assets/", cors(), express.static(path.resolve(dirname, "../assets/")));

const userNetworkingServer = new UserNetworkingServer();
app.ws("/network", (ws) => {
  userNetworkingServer.connectClient(ws);
});

const chatNetworkingServer = new ChatNetworkingServer();
app.ws("/chat-network", (ws, req) => {
  chatNetworkingServer.connectClient(ws, parseInt(req.query.id as string, 10));
});

// Serve the app (including development mode)
addWebAppRoutes(app);

// Start listening
console.log("Listening on port", PORT);
app.listen(PORT);
