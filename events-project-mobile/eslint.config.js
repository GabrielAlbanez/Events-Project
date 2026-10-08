const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');
module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/**', 'server/dist/**', 'server/node_modules/**'] },
  { files: ['**/*.cjs', '**/*.mjs', 'server/independent/src/**/*.ts'], languageOptions: { globals: globals.node } },
]);
