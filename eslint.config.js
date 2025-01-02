const { defineConfig } = require('eslint-define-config');

module.exports = defineConfig({
  env: {
    browser: false,
    node: true,
    es2021: true,
  },
  extends: ['eslint:recommended'],
  rules: {
    'no-console': 'warn',
  },
});

