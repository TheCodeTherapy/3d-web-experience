import path from "path";
import url from "url";

import express from "express";
import enableWs from "express-ws";

import { websocketDirectoryChangeListener } from "../../../../utils/websocketDirectoryChangeListener";

const dirname = url.fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 8081;

const { app } = enableWs(express());
app.enable("trust proxy");

const webClientBuildDir = path.join(dirname, "../../client/build/");
app.use("/", express.static(webClientBuildDir));

if (process.env.NODE_ENV !== "production") {
  websocketDirectoryChangeListener(app, {
    directory: webClientBuildDir,
    websocketPath: "/web-avatar-build",
  });
}

// Start listening
console.log("Listening on port", PORT);
app.listen(PORT);
