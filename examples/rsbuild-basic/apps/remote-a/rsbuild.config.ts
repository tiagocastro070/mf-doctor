import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";

export default defineConfig({
  server: {
    port: 3001,
  },
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: "remoteA",
      exposes: {
        "./Button": "./src/Button",
      },
      shared: {
        react: {
          singleton: true,
          requiredVersion: "18.2.0",
        },
        "react-dom": {
          singleton: true,
          requiredVersion: "18.2.0",
        },
      },
    }),
  ],
});
