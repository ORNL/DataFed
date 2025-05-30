module.exports = {
  presets: [
    "@babel/preset-env", // For compiling modern JavaScript down to older versions
    "@babel/preset-react", // For compiling JSX
    "@babel/preset-typescript", // For compiling TypeScript
  ],
  plugins: [
    ["@babel/plugin-proposal-decorators", { legacy: true }],
    "@babel/plugin-transform-flow-strip-types",
  ],
};
