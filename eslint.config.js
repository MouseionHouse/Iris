// ESLint 9 flat config. It keeps the rules of the old .eslintrc.cjs: ESLint's recommended rules,
// React's, typescript-eslint's recommended, Airbnb's style guide (through
// eslint-config-airbnb-extended's `legacy` configs, a port of eslint-config-airbnb to flat
// config), with Prettier switching off whatever it formats.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier/flat';
import { configs as airbnb } from 'eslint-config-airbnb-extended/legacy';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/', 'dist-mobile/', 'experiment/', 'node_modules/', '.worktrees/'],
  },
  js.configs.recommended,
  react.configs.flat.recommended,
  tseslint.configs.recommended,
  // eslint-config-airbnb: the base rules, React, JSX a11y
  ...airbnb.react.recommended,
  prettier,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // eslint-plugin-react-hooks 7's own recommended set adds the React Compiler's rules; these two
      // are the set the project has used.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      'linebreak-style': 'off',
      'no-underscore-dangle': 'off',
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      // typescript-eslint 5 warned about both in its recommended set; 8 errors on `any` and leaves
      // out the other. Kept as they were.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      'import/prefer-default-export': 'off',
      'import/extensions': 'off',
      'import/no-unresolved': 'off',
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],

      'react/no-unstable-nested-components': ['error', { allowAsProps: true }],
      'react/jsx-filename-extension': ['error', { extensions: ['.tsx', '.jsx'] }],
      'react/require-default-props': 'off',
      'react/jsx-props-no-spreading': 'off',
    },
  },
  {
    // Copied from matrix-react-sdk (MegolmExportEncryption.js): the key export file format, built
    // and read byte by byte. Left as written rather than restyled.
    files: ['src/util/cryptE2ERoomKeys.js'],
    rules: {
      'no-bitwise': 'off',
      'no-plusplus': 'off',
      'no-param-reassign': 'off',
      'prefer-template': 'off',
    },
  },
  {
    // TypeScript checks names itself, and @typescript-eslint/no-unused-vars replaces the base rule,
    // which misreads type-only names.
    files: ['**/*.{ts,tsx}'],
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off' },
  }
);
