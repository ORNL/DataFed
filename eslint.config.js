const globals = require("globals");

module.exports = [
    {
        languageOptions: {
            globals: {
                ...globals.jquery,
                ...globals.node,
            },
        },
    },
];
