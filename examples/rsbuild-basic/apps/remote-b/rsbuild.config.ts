import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";

export default defineConfig({
  server: {
    port: 3002,
  },
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: "remoteB",
      exposes: {
        "./Card": "./src/Card",
        "./Button": "./src/Button",
      },
      remotes: {
        remoteC: "remoteC@http://localhost:3003/mf-manifest.json",
      },
      shared: {
        react: {
          singleton: true,
          requiredVersion: "^18.3.1",
        },
        "react-dom": {
          singleton: true,
          requiredVersion: "^18.3.1",
        },
      },
    }),
  ],
});
