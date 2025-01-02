
const globals = require("globals");

const customGlobals = {
  TomSelect: "readable",
};

module.exports = [{
  languageOptions: {
    globals: {
      ...customGlobals,
      ...globals.jquery,
      ...globals.node,
    },
  },
}];
