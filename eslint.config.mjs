// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Single ESLint flat config for the whole monorepo.
 *
 * Per-package runtime globals differ (Node for the API and shared packages,
 * browser for the web app), so they are applied per file glob rather than
 * globally to avoid silencing real errors.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '.agents/**',
      '**/*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Rule 2 of pulseboard-architecture: boundaries must validate external
      // input at runtime. `any` erases that obligation, so it is an error.
      '@typescript-eslint/no-explicit-any': 'error',
      // Rule 7: silent fallthrough and unused results hide ownership bugs.
      'no-fallthrough': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
      'prefer-const': 'error',
      'object-shorthand': 'error',
    },
  },
  {
    files: ['packages/shared/**/*.ts', 'apps/api/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      // Tests intentionally assert on loosely typed JSON payloads.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
);