import cssModulesPlugin from "esbuild-css-modules-plugin";

import { handleLibraryBuild } from "../../utils/build-library";

handleLibraryBuild(
  [
    cssModulesPlugin({
      inject: true,
      emitDeclarationFile: true
    }),
  ],
  {
    ".svg": "text",
  },
);
