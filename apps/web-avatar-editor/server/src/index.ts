import path from "path";
import url from "url";

import cors from "cors";
import express from "express";
import enableWs from "express-ws";

import { websocketDirectoryChangeListener } from "../../../../utils/websocketDirectoryChangeListener";

const dirname = url.fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 8082;

// Specify the avatar to use here:
const { app } = enableWs(express());
app.enable("trust proxy");

const webAvatarEditorBuildDir = path.join(dirname, "../../client/build/");
app.use("/", express.static(webAvatarEditorBuildDir));
if (process.env.NODE_ENV !== "production") {
  websocketDirectoryChangeListener(app, {
    directory: webAvatarEditorBuildDir,
    websocketPath: "/web-avatar-build",
  });
}

app.use("/assets/", cors(), express.static(path.resolve(dirname, "../../../assets/")));

// Start listening
console.log("Listening on port", PORT);
app.listen(PORT);
