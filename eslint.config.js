import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {ignores: ['dist', 'coverage', 'node_modules', 'supabase/functions']},
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/web/**/*.{ts,tsx}'],
    languageOptions: {globals: globals.browser},
    plugins: {'react-hooks': reactHooks},
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['src/job/**/*.ts', '*.config.{js,ts}'],
    languageOptions: {globals: globals.node},
  },
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports (Google style).',
        },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {argsIgnorePattern: '^_', varsIgnorePattern: '^_'},
      ],
    },
  },
  {files: ['*.config.{js,ts}'], rules: {'no-restricted-syntax': 'off'}},
);
