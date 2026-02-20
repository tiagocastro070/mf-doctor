import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: "shell",
      remotes: {
        remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
        remoteB: "remoteB@http://localhost:3002/mf-manifest.json",
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
