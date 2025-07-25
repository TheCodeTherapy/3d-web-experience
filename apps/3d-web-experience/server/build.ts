/* eslint-disable import/no-extraneous-dependencies */
import * as esbuild from "esbuild";

import { rebuildOnDependencyChangesPlugin } from "../../../utils/rebuildOnDependencyChangesPlugin";

const buildMode = "--build";
const watchMode = "--watch";

const helpString = `Mode must be provided as one of ${buildMode} or ${watchMode}`;

const args = process.argv.splice(2);

if (args.length !== 1) {
  console.error(helpString);
  process.exit(1);
}

const mode = args[0];

const buildOptions: esbuild.BuildOptions = {
  entryPoints: ["src/index.ts"],
  outdir: "./build",
  bundle: true,
  metafile: true,
  format: "esm",
  packages: "external",
  sourcemap: true,
  platform: "node",
  target: "es2020",
  plugins: mode === watchMode ? [rebuildOnDependencyChangesPlugin] : [],
};

switch (mode) {
  case buildMode:
    esbuild.build(buildOptions).catch(() => process.exit(1));
    break;
  case watchMode:
    esbuild
      .context({ ...buildOptions })
      .then((context) => context.watch())
      .catch(() => process.exit(1));
    break;
  default:
    console.error(helpString);
}
