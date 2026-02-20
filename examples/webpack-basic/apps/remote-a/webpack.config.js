const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  plugins: [
    new ModuleFederationPlugin({
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
};
