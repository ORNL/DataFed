const globals = require("globals");
const jsdocPlugin = require("eslint-plugin-jsdoc");

module.exports = [
    {
        ignores: ["docs/_static/**/*", "web/static/jquery/jquery.js", "web/node_modules"],
        languageOptions: {
            globals: {
                ...globals.jquery,
                ...globals.node,
            },
        },
        files: ["web/**/*.js", "core/**/*.js"], // Adjust file patterns as needed
        plugins: {
            jsdoc: jsdocPlugin,
        },
        rules: {
            "jsdoc/check-alignment": "error",
            "jsdoc/check-indentation": "error",
            "jsdoc/check-param-names": "error",
            "jsdoc/check-tag-names": "error",
            "jsdoc/check-types": "error",
            "jsdoc/require-param": "error",
            "jsdoc/require-param-name": "error",
            "jsdoc/require-param-type": "error",
            "jsdoc/require-param-description": "error",
            "jsdoc/require-returns": "error",
            "jsdoc/require-returns-description": "error",
            "jsdoc/require-returns-type": "error",
        },
    },
];
