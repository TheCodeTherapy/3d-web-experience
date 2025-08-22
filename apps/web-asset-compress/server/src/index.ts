#!/usr/bin/env node
"use strict";

import fs from "fs";
import path from "path";
import url, { fileURLToPath } from "url";

import { WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { draco, simplify, textureCompress, weld } from "@gltf-transform/functions";
import bodyParser from "body-parser";
import cors from "cors";
import draco3d from "draco3dgltf";
import express, { Request, Response } from "express";
import enableWs from "express-ws";
import { MeshoptSimplifier } from "meshoptimizer";
import multer from "multer";

import { websocketDirectoryChangeListener } from "../../../../utils/websocketDirectoryChangeListener";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const optimizationApp = express();
const optimizationPort = process.env.PORT || 8083;
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

optimizationApp.use(cors());
optimizationApp.use(express.json());
optimizationApp.use(bodyParser.json({ limit: "500mb" }));
optimizationApp.use(bodyParser.urlencoded({ limit: "500mb", extended: true }));
optimizationApp.use(express.json({ limit: "500mb" }));

optimizationApp.post(
  "/optimize",
  upload.single("asset"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No asset file provided." });
        return;
      }

      const {
        simplifyRatio = 0.7,
        simplifyError = 0.001,
        textureFormat = "webp",
        textureResize = [1024, 1024],
      } = req.body;

      const inputPath = req.file.path;
      const outputPath = `optimized-${Date.now()}.glb`;
      const fileBuffer = fs.readFileSync(inputPath);

      const io = new WebIO();
      io.registerExtensions(ALL_EXTENSIONS).registerDependencies({
        "draco3d.decoder": await draco3d.createDecoderModule(),
        "draco3d.encoder": await draco3d.createEncoderModule(),
      });

      const doc = await io.readBinary(new Uint8Array(fileBuffer.buffer));

      const textureResizeParsed = Array.isArray(textureResize)
        ? textureResize
        : JSON.parse(textureResize || "[1024, 1024]");

      await doc.transform(
        weld(),
        simplify({
          simplifier: MeshoptSimplifier,
          ratio: parseFloat(simplifyRatio),
          error: parseFloat(simplifyError),
        }),
        textureCompress({
          targetFormat: textureFormat,
          resize: textureResizeParsed.map(Number),
        }),
        draco(),
      );

      const compressedArrayBuffer = await io.writeBinary(doc);
      fs.writeFileSync(outputPath, Buffer.from(compressedArrayBuffer));

      res.download(outputPath, (err) => {
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
        if (err) {
          console.error("Error sending file:", err);
        }
      });
    } catch (error) {
      console.error("Error processing asset:", error);
      res.status(500).json({ error: "Asset processing failed." });
    }
  },
);

optimizationApp.listen(optimizationPort, () => {
  console.log(`✅ Optimization server running at: http://localhost:${optimizationPort}`);
});

const dirname = url.fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 8085;
const { app } = enableWs(express());
app.enable("trust proxy");

const webClientBuildDir = path.join(dirname, "../../client/build/");
app.use("/", express.static(webClientBuildDir));

if (process.env.NODE_ENV !== "production") {
  websocketDirectoryChangeListener(app, {
    directory: webClientBuildDir,
    websocketPath: "/web-asset-compress",
  });
}

console.log("Listening on port", PORT);
app.listen(PORT);
