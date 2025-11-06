import * as esbuild from "esbuild";

import { dtsPlugin } from "./dtsPlugin";
import { rebuildOnDependencyChangesPlugin } from "./rebuildOnDependencyChangesPlugin";

const buildMode = "--build";
const watchMode = "--watch";

const helpString = `Mode must be provided as one of ${buildMode} or ${watchMode}`;

type LibraryBuildOptions = {
  entryPoints: {
    [key: string]: string;
  };
  plugins: Array<esbuild.Plugin>;
  loader: { [key: string]: esbuild.Loader };
  platformOverride: esbuild.Platform;
};

export function handleLibraryBuild(optionsArg?: Partial<LibraryBuildOptions>) {
  const options = {
    plugins: [],
    loader: {},
    entryPoints: {
      index: "src/index.ts",
    },
    ...optionsArg,
  };
  const args = process.argv.splice(2);

  if (args.length !== 1) {
    console.error(helpString);
    process.exit(1);
  }

  const mode = args[0];

  const buildOptions: esbuild.BuildOptions = {
    entryPoints: options.entryPoints,
    write: true,
    bundle: true,
    metafile: true,
    format: "esm",
    outdir: "build",
    platform: options.platformOverride || "node",
    packages: "external",
    external: ["fs", "path"],
    sourcemap: true,
    target: "node14",
    loader: {
      ...options.loader,
    },
    plugins: [
      ...options.plugins,
      mode === watchMode ? rebuildOnDependencyChangesPlugin() : null,
      dtsPlugin(),
    ].filter(Boolean) as esbuild.Plugin[],
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
}
