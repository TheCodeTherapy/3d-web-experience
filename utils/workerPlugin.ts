import * as path from "path";

import * as esbuild from "esbuild";

import { base64Plugin } from "./base64Plugin";

export function workerPlugin(): esbuild.Plugin {
  return {
    name: "worker-plugin",
    setup(build) {
      // Handle imports that have the pattern *.worker
      build.onResolve({ filter: /\.worker$/ }, (args) => {
        return {
          path: path.resolve(args.resolveDir, args.path),
          namespace: "worker",
        };
      });

      build.onLoad({ filter: /.*/, namespace: "worker" }, async (args) => {
        // Add the worker file as a dependency so changes trigger rebuilds
        const workerPath = args.path;

        // Build the worker as a separate bundle
        const workerResult = await esbuild.build({
          entryPoints: [workerPath],
          bundle: true,
          write: false,
          format: "iife",
          target: "es2022",
          platform: "browser",
          packages: "bundle", // Bundle everything for workers
          sourcemap: false,
          external: ["fs", "path"],
          minify: true,
          metafile: true, // Enable metafile to track dependencies
          plugins: [base64Plugin()],
        });

        if (workerResult.outputFiles.length === 0) {
          throw new Error(`Failed to build worker: ${workerPath}`);
        }

        // Get the compiled worker code
        const workerCode = workerResult.outputFiles[0].text;

        // Create a blob URL for the worker
        const workerBlob = `
          const workerCode = ${JSON.stringify(workerCode)};
          const blob = new Blob([workerCode], { type: 'application/javascript' });
          export default URL.createObjectURL(blob);
        `;

        return {
          contents: workerBlob,
          loader: "js",
          // Add the worker file and its dependencies as watch files
          watchFiles: [
            workerPath,
            ...(workerResult.metafile?.inputs ? Object.keys(workerResult.metafile.inputs) : []),
          ],
        };
      });
    },
  };
}
