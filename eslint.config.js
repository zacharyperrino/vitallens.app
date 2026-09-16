// ESLint flat config for the frontend.
// Written as CommonJS because this package is "type": "commonjs" and CI runs
// Node 20, which does not auto-detect ESM syntax in .js files.
const js = require('@eslint/js');
const globals = require('globals');

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  'no-empty': ['error', { allowEmptyCatch: true }],
};

module.exports = [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'server/**', // separate repo with its own eslint.config.js
      'docs/**',
      'legal/**',
      'benchmark/**',
      'VitalLensMem/**',
      '.obsidian/**',
    ],
  },
  js.configs.recommended,

  // App source: browser ESM (+ JSX for the React islands in src/components).
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules,
  },

  // Service worker.
  {
    files: ['public/sw.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.serviceworker },
    },
    rules,
  },

  // Node-side tooling: Vite/Vitest configs (ESM) and scripts.
  {
    files: ['vite.config.js', 'vitest.config.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules,
  },

  // This config file itself is CommonJS.
  {
    files: ['eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules,
  },
];
