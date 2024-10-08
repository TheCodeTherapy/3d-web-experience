import cssModulesPlugin from "esbuild-css-modules-plugin";

import { handleLibraryBuild } from "../../utils/build-library";

handleLibraryBuild({
  plugins: [
    cssModulesPlugin({
      inject: true,
      emitDeclarationFile: true,
    }),
  ],
  loader: {
    ".svg": "text",
  },
});
