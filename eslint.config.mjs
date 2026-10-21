import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import shared from './eslint.shared.cjs';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'apps/**',
      '.design/**',
      '.superpowers/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', shared.engineRestrictedImports],
      'no-restricted-syntax': ['error', ...shared.noArglessDate],
      ...shared.sizeLimits,
    },
  },
);
