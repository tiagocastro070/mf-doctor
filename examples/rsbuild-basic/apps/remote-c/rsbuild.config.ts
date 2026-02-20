import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";

export default defineConfig({
  server: {
    port: 3003,
  },
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: "remoteC",
      exposes: {
        "./Widget": "./src/Widget",
      },
      remotes: {
        shell: "shell@http://localhost:3000/mf-manifest.json",
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
