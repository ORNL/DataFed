const globals = require("globals");

module.exports = [
    {
        languageOptions: {
            globals: {
                ...globals.jquery,
                ...globals.node,
            },
        },
        files: ['**/*.js', '**/*.ts'], // Adjust file patterns as needed
        plugins: {
            jsdoc: jsdocPlugin,
        },
        rules: {
            // Enforce proper alignment and formatting of JSDoc
            'jsdoc/check-alignment': 'error',
            'jsdoc/check-indentation': 'error',
            'jsdoc/check-param-names': 'error',
            'jsdoc/check-tag-names': 'error',
            'jsdoc/check-types': 'error',
            'jsdoc/newline-after-description': 'error',
            'jsdoc/require-description': 'error',
            'jsdoc/require-param': 'error',
            'jsdoc/require-param-name': 'error',
            'jsdoc/require-param-type': 'error',
            'jsdoc/require-param-description': 'error',
            'jsdoc/require-returns': 'error',
            'jsdoc/require-returns-description': 'error',
            'jsdoc/require-returns-type': 'error',
        },
    }
];
