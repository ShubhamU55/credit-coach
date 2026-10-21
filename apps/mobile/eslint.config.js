// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const shared = require('../../eslint.shared.cjs');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'android/*', 'ios/*'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/ui/theme/**'],
    rules: {
      'no-restricted-syntax': ['error', ...shared.noRawHex],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', shared.crossAppImport('admin')],
      '@typescript-eslint/naming-convention': [
        'warn',
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'variable', format: ['camelCase', 'PascalCase', 'UPPER_CASE'] },
      ],
      ...shared.sizeLimits,
    },
  },
]);
