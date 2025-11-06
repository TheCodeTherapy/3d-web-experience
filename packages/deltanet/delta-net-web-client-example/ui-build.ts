import * as esbuild from "esbuild";
import { copy } from "esbuild-plugin-copy";

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
  entryPoints: {
    index: "ui-src/index.tsx",
  },
  bundle: true,
  write: true,
  sourcemap: true,
  metafile: true,
  outbase: "./ui-src",
  target: "esnext",
  publicPath: "/",
  outdir: "./build/ui/",
  assetNames: "/[name]-[hash]",
  preserveSymlinks: true,
  format: "esm",
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
  },
  loader: {
    ".svg": "file",
    ".png": "file",
    ".jpg": "file",
    ".glb": "file",
    ".hdr": "file",
  },
  plugins: [
    copy({
      resolveFrom: "cwd",
      assets: {
        from: ["./ui-src/static/**/*"],
        to: ["./build/ui/"],
      },
    }),
  ],
};

switch (mode) {
  case buildMode:
    esbuild.build(buildOptions).catch(() => process.exit(1));
    break;
  case watchMode:
    esbuild
      .context({
        ...buildOptions,
        banner: {
          js: ` (() => {
            let current;
            function connect(reconnecting){
              const ws = new WebSocket((window.location.protocol === "https:" ? "wss://" : "ws://")+window.location.host+'/ui-build');
              current = ws;
              ws.addEventListener('open',(e)=>{
                if (reconnecting) {
                  location.reload();
                }
              });
              ws.addEventListener('error',(e)=>{setTimeout(() => {(ws === current) && connect(true)}, 1000)});
              ws.addEventListener('close',(e)=>{setTimeout(() => {(ws === current) && connect(true)}, 1000)});
              ws.addEventListener('message', () => location.reload());
            }
            connect();
          })();`,
        },
      })
      .then((context) => context.watch())
      .catch(() => process.exit(1));
    break;
  default:
    console.error(helpString);
}
