// Backend lint config. CommonJS and Node globals, unlike the frontend's
// browser/JSX setup, so the two cannot share one file.
//
// Deliberately close to eslint's recommended set rather than a style guide:
// the value here is catching genuine mistakes (an unused variable that should
// have been passed on, a promise nobody awaits) rather than arguing about
// formatting in a single-author codebase.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      // Route handlers legitimately take (req, res) and use only one of them,
      // and Express identifies error middleware by arity, so an unused arg is
      // sometimes load-bearing. Leading underscore opts out.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // An un-awaited query inside a handler returns 200 with no data and
      // nothing in the log. This is the failure mode worth a linter.
      'require-atomic-updates': 'error',
      'no-return-await': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
